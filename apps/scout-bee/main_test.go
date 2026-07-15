package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type fakeRunner struct {
	commands       []command
	secretsPayload []byte
}

func (f *fakeRunner) Find(string) error { return nil }
func (f *fakeRunner) Run(_ context.Context, spec command, _ map[string]string) (string, error) {
	f.commands = append(f.commands, spec)
	for index, arg := range spec.Args {
		if arg == "--secrets-file" && index+1 < len(spec.Args) {
			f.secretsPayload, _ = os.ReadFile(spec.Args[index+1])
		}
	}
	joined := strings.Join(spec.Args, " ")
	switch {
	case strings.Contains(joined, "d1 list"):
		return `[{"name":"apiarylens-family","uuid":"11111111-2222-3333-4444-555555555555"}]`, nil
	case strings.Contains(joined, "r2 bucket list"):
		return "Listing buckets...\nname: apiarylens-family-media\ncreation_date: 2026-07-15T00:00:00Z\n", nil
	case strings.Contains(joined, "deploy"):
		return spec.Environment["TEST_HEALTH_URL"], nil
	default:
		return `{}`, nil
	}
}

func validPlan() plan {
	return plan{
		SchemaVersion: 1,
		PlanID:        "11111111-1111-4111-8111-111111111111",
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
		Release: release{
			Version: "0.1.0-rc.1", Channel: "release-candidate",
			ManifestURL:    "https://apiarylens.org/releases/0.1.0-rc.1/manifest.json",
			ManifestSha256: strings.Repeat("0", 64),
		},
		Operation: "install", Target: "cloudflare",
		Cloudflare: &cloudflare{
			AccountReference: "0123456789abcdef0123456789abcdef",
			WorkerName:       "apiarylens-family", D1DatabaseName: "apiarylens-family",
			R2BucketName: "apiarylens-family-media", CostProfile: "family-free-guarded",
		},
	}
}
func TestValidatePlan(t *testing.T) {
	if err := validate(validPlan()); err != nil {
		t.Fatal(err)
	}
}
func TestRejectsHTTPCompose(t *testing.T) {
	p := validPlan()
	p.Target = "compose-ssh"
	p.Cloudflare = nil
	p.Compose = &compose{PublicURL: "http://hives.example", TargetDirectory: "/opt/apiarylens", SSHHostKeySha256: "SHA256:abc"}
	if err := validate(p); err == nil {
		t.Fatal("expected HTTP to be rejected")
	}
}
func TestRecognizesNativeWorkersDevAddress(t *testing.T) {
	if !isWorkersDevAddress("https://apiarylens-family-uat.example.workers.dev") {
		t.Fatal("expected native workers.dev address")
	}
	if isWorkersDevAddress("https://hives.example.com") {
		t.Fatal("custom domain was mistaken for workers.dev")
	}
}
func TestComposeInstallRequiresProtectedBootstrap(t *testing.T) {
	p := validPlan()
	p.Target = "compose-ssh"
	p.Cloudflare = nil
	p.Compose = &compose{PublicURL: "https://hives.example", TargetDirectory: "/opt/apiarylens", SSHHostKeySha256: "SHA256:abc"}
	adapter := &composeAdapter{executor: &executor{runner: &fakeRunner{}}}
	phases, err := adapter.preflight(context.Background(), request{Plan: p, Secrets: map[string]string{}})
	if err == nil || len(phases) != 1 || phases[0].State != "failed" {
		t.Fatalf("expected protected bootstrap preflight failure, err=%v phases=%+v", err, phases)
	}
}
func TestRejectsSecretLookingPlan(t *testing.T) {
	p := validPlan()
	p.Cloudflare.AccountReference = "my-secret-token"
	if err := validate(p); err == nil {
		t.Fatal("expected secret-looking value to be rejected")
	}
}
func TestRedactsRuntimeSecrets(t *testing.T) {
	got := redact("failure abc123", map[string]string{"token": "abc123"})
	if strings.Contains(got, "abc123") {
		t.Fatal("secret was not redacted")
	}
}

func TestPlanJSONUsesVersionedCamelCaseContract(t *testing.T) {
	raw, err := json.Marshal(validPlan())
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"schemaVersion", "planId", "manifestUrl", "manifestSha256", "d1DatabaseName"} {
		if !bytes.Contains(raw, []byte(`"`+field+`"`)) {
			t.Fatalf("missing JSON field %s: %s", field, raw)
		}
	}
}

func TestFetchManifestVerifiesPinnedChecksum(t *testing.T) {
	manifest := []byte(`{"product":"ApiaryLens","productVersion":"0.1.0-rc.1","channel":"release-candidate","contracts":{"api":"1.0","sync":1,"databaseMigration":"0003","deploymentPlan":1},"artifacts":[]}`)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(manifest) }))
	defer server.Close()
	digest := sha256.Sum256(manifest)
	executor := newExecutor()
	executor.allowLoopback = true
	p := validPlan()
	p.Release.ManifestURL = server.URL
	p.Release.ManifestSha256 = hex.EncodeToString(digest[:])
	got, err := executor.fetchManifest(context.Background(), p.Release)
	if err != nil {
		t.Fatal(err)
	}
	if got.ProductVersion != p.Release.Version {
		t.Fatalf("unexpected version %q", got.ProductVersion)
	}
	p.Release.ManifestSha256 = strings.Repeat("f", 64)
	if _, err := executor.fetchManifest(context.Background(), p.Release); err == nil {
		t.Fatal("expected checksum mismatch")
	}
}

func TestCloudflareApplyUsesVerifiedBundleAndRuntimeSecret(t *testing.T) {
	artifact := testTarGz(t, map[string]string{
		"worker/index.js":            "export default {fetch(){return new Response('ok')}}",
		"worker/migrations/0001.sql": "select 1;",
		"web/index.html":             "<!doctype html><title>ApiaryLens</title>",
	})
	artifactDigest := sha256.Sum256(artifact)
	var manifest []byte
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			_, _ = w.Write(manifest)
		case "/bundle.tar.gz":
			_, _ = w.Write(artifact)
		case "/health":
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "product": "ApiaryLens", "version": "0.1.0-rc.1"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	manifest = []byte(fmt.Sprintf(`{"product":"ApiaryLens","productVersion":"0.1.0-rc.1","channel":"release-candidate","contracts":{"api":"1.0","sync":1,"databaseMigration":"0003","deploymentPlan":1},"artifacts":[{"name":"bundle.tar.gz","kind":"deployment-bundle","target":"cloudflare","url":%q,"sha256":"%s","bytes":%d}]}`, server.URL+"/bundle.tar.gz", hex.EncodeToString(artifactDigest[:]), len(artifact)))
	manifestDigest := sha256.Sum256(manifest)
	p := validPlan()
	p.Release.ManifestURL = server.URL + "/manifest.json"
	p.Release.ManifestSha256 = hex.EncodeToString(manifestDigest[:])
	runner := &fakeRunner{}
	executor := &executor{runner: runner, client: server.Client()}
	// Add the health URL as the requested custom domain so deploy output parsing is not needed.
	p.Cloudflare.CustomDomain = server.URL
	phases, err := executor.run(context.Background(), request{Plan: p, Mode: "apply", Secrets: map[string]string{"cloudflareApiToken": "runtime-only-token", "bootstrapToken": "runtime-owner-code-only"}})
	if err != nil {
		t.Fatalf("apply failed: %v; phases=%+v", err, phases)
	}
	if len(runner.commands) < 5 {
		t.Fatalf("expected target commands, got %d", len(runner.commands))
	}
	rawPlan, _ := json.Marshal(p)
	if bytes.Contains(rawPlan, []byte("runtime-only-token")) {
		t.Fatal("runtime secret entered the deployment plan")
	}
	for _, phase := range phases {
		if strings.Contains(phase.Detail, "runtime-only-token") {
			t.Fatal("runtime secret entered progress output")
		}
	}
	var deployedSecrets map[string]string
	if err = json.Unmarshal(runner.secretsPayload, &deployedSecrets); err != nil {
		t.Fatalf("runtime secrets file was not readable JSON: %v", err)
	}
	if deployedSecrets["BOOTSTRAP_TOKEN"] != "runtime-owner-code-only" || len(deployedSecrets["AUTH_ROOT_SECRET"]) < 32 {
		t.Fatalf("deployment did not atomically install both required runtime secrets")
	}
}

func TestCloudflareBackupUsesTemporaryAuthorizationAndWritesVerifiedArchive(t *testing.T) {
	var backup bytes.Buffer
	zipWriter := zip.NewWriter(&backup)
	manifestFile, err := zipWriter.Create("manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = manifestFile.Write([]byte(`{"product":"ApiaryLens","backupFormat":1}`))
	if err = zipWriter.Close(); err != nil {
		t.Fatal(err)
	}

	var releaseManifest []byte
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			_, _ = w.Write(releaseManifest)
		case "/api/v1/operator/backup":
			if r.Header.Get("authorization") == "" {
				t.Error("missing temporary authorization")
			}
			_, _ = w.Write(backup.Bytes())
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	releaseManifest = []byte(`{"product":"ApiaryLens","productVersion":"0.1.0-rc.1","channel":"release-candidate","contracts":{"api":"1.0","sync":1,"databaseMigration":"0003","deploymentPlan":1},"artifacts":[]}`)
	digest := sha256.Sum256(releaseManifest)
	p := validPlan()
	p.Operation = "backup"
	p.Cloudflare.CustomDomain = server.URL
	p.Release.ManifestURL = server.URL + "/manifest.json"
	p.Release.ManifestSha256 = hex.EncodeToString(digest[:])
	destination := t.TempDir()
	runner := &fakeRunner{}
	executor := &executor{runner: runner, client: server.Client()}
	phases, err := executor.run(context.Background(), request{Plan: p, Mode: "apply", Secrets: map[string]string{"cloudflareApiToken": "runtime-only-token", "backupDestination": destination}})
	if err != nil {
		t.Fatalf("backup failed: %v; phases=%+v", err, phases)
	}
	archives, err := filepath.Glob(filepath.Join(destination, "apiarylens-backup-*.zip"))
	if err != nil || len(archives) != 1 {
		t.Fatalf("expected one archive, got %v (%v)", archives, err)
	}
	if _, err = os.Stat(archives[0]); err != nil {
		t.Fatal(err)
	}
	commands := strings.Join(commandArgs(runner.commands), "\n")
	if !strings.Contains(commands, "secret bulk --name") || !strings.Contains(commands, "secret delete SCOUT_OPERATOR_TOKEN") {
		t.Fatalf("temporary secret lifecycle was incomplete: %s", commands)
	}
}

func TestCloudflareUpdateRequiresVerifiedBackupBeforeMigration(t *testing.T) {
	artifact := testTarGz(t, map[string]string{
		"worker/index.js":            "export default {fetch(){return new Response('ok')}}",
		"worker/migrations/0001.sql": "select 1;",
		"web/index.html":             "<!doctype html><title>ApiaryLens</title>",
	})
	artifactDigest := sha256.Sum256(artifact)
	var backup bytes.Buffer
	zipWriter := zip.NewWriter(&backup)
	manifestFile, err := zipWriter.Create("manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = manifestFile.Write([]byte(`{"product":"ApiaryLens","backupFormat":1}`))
	if err = zipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/bundle.tar.gz":
			_, _ = w.Write(artifact)
		case "/api/v1/operator/backup":
			_, _ = w.Write(backup.Bytes())
		case "/health":
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "product": "ApiaryLens", "version": "0.1.0-rc.1"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	p := validPlan()
	p.Operation = "update"
	p.Cloudflare.CustomDomain = server.URL
	runner := &fakeRunner{}
	adapter := &cloudflareAdapter{executor: &executor{runner: runner, client: server.Client()}}
	manifest := releaseManifest{
		Product: "ApiaryLens", ProductVersion: "0.1.0-rc.1",
		Artifacts: []manifestArtifact{{
			Name: "bundle.tar.gz", Kind: "deployment-bundle", Target: "cloudflare",
			URL: server.URL + "/bundle.tar.gz", Sha256: hex.EncodeToString(artifactDigest[:]), Bytes: int64(len(artifact)),
		}},
	}
	destination := t.TempDir()
	phases, err := adapter.deploy(context.Background(), request{
		Plan: p, Mode: "apply", Secrets: map[string]string{
			"cloudflareApiToken": "runtime-only-token", "backupDestination": destination,
		},
	}, manifest)
	if err != nil {
		t.Fatalf("update failed: %v; phases=%+v", err, phases)
	}
	backupIndex, migrationIndex := -1, -1
	for index, phase := range phases {
		if phase.Name == "Require verified backup before update" && phase.State == "passed" {
			backupIndex = index
		}
		if phase.Name == "Apply compatible database migrations" {
			migrationIndex = index
		}
	}
	if backupIndex < 0 || migrationIndex < 0 || backupIndex >= migrationIndex {
		t.Fatalf("backup did not pass before migration: %+v", phases)
	}
	archives, _ := filepath.Glob(filepath.Join(destination, "apiarylens-backup-*.zip"))
	if len(archives) != 1 {
		t.Fatalf("expected one verified pre-update backup, got %v", archives)
	}
}

func TestCloudflareOperatorRequestWaitsForSecretPropagation(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if r.Header.Get("authorization") != "Bearer temporary-token" {
			t.Fatal("operator authorization was not sent")
		}
		if attempts == 1 {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	adapter := &cloudflareAdapter{executor: &executor{client: server.Client()}}
	response, err := adapter.operatorRequest(
		context.Background(),
		http.MethodPost,
		server.URL,
		"temporary-token",
		[]byte("archive"),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || attempts != 2 {
		t.Fatalf("expected a successful retry after propagation, status=%d attempts=%d", response.StatusCode, attempts)
	}
}

func TestCloudflareHealthRejectsBuildIdentityMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "ok", "product": "ApiaryLens", "version": "0.1.0-rc.1",
			"build": map[string]string{
				"sourceCommit": "wrong", "buildTime": "wrong", "artifactIdentity": "wrong",
			},
		})
	}))
	defer server.Close()
	adapter := &cloudflareAdapter{executor: &executor{client: server.Client()}, healthAttempts: 1}
	err := adapter.verifyHealth(context.Background(), server.URL, releaseManifest{
		ProductVersion: "0.1.0-rc.1", SourceCommit: strings.Repeat("a", 40), BuildTime: "2026-07-15T00:00:00Z",
	})
	if err == nil || !strings.Contains(err.Error(), "build identity") {
		t.Fatalf("expected build identity mismatch, got %v", err)
	}
}

func TestCloudflareHealthWaitsForExactBuildIdentityPropagation(t *testing.T) {
	attempts := 0
	expectedCommit := strings.Repeat("a", 40)
	expectedBuildTime := "2026-07-15T00:00:00Z"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts++
		commit, buildTime, identity := "predecessor", "earlier", "ApiaryLens@0.1.0-rc.1+earlier"
		if attempts > 1 {
			commit, buildTime, identity = expectedCommit, expectedBuildTime, "ApiaryLens@0.1.0-rc.1+aaaaaaa"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "ok", "product": "ApiaryLens", "version": "0.1.0-rc.1",
			"build": map[string]string{
				"sourceCommit": commit, "buildTime": buildTime, "artifactIdentity": identity,
			},
		})
	}))
	defer server.Close()
	adapter := &cloudflareAdapter{
		executor: &executor{client: server.Client()}, healthAttempts: 2, healthRetryDelay: time.Millisecond,
	}
	if err := adapter.verifyHealth(context.Background(), server.URL, releaseManifest{
		ProductVersion: "0.1.0-rc.1", SourceCommit: expectedCommit, BuildTime: expectedBuildTime,
	}); err != nil {
		t.Fatalf("expected health identity to converge: %v", err)
	}
	if attempts != 2 {
		t.Fatalf("expected two health attempts, got %d", attempts)
	}
}

func TestCloudflareKeepDataUninstallRetainsRecoverableServiceSecrets(t *testing.T) {
	p := validPlan()
	p.Operation = "uninstall"
	p.KeepDataOnUninstall = true
	runner := &fakeRunner{}
	adapter := &cloudflareAdapter{executor: &executor{runner: runner}}
	phases, err := adapter.uninstall(context.Background(), request{
		Plan:    p,
		Secrets: map[string]string{"cloudflareApiToken": "runtime-only-token"},
	})
	if err != nil || len(phases) != 1 || phases[0].State != "passed" {
		t.Fatalf("keep-data uninstall failed: err=%v phases=%+v", err, phases)
	}
	commands := strings.Join(commandArgs(runner.commands), "\n")
	if !strings.Contains(commands, "deploy --config") || strings.Contains(commands, "delete --name") {
		t.Fatalf("uninstall did not preserve the Worker secret container: %s", commands)
	}
}

func commandArgs(commands []command) []string {
	result := make([]string, 0, len(commands))
	for _, command := range commands {
		result = append(result, strings.Join(command.Args, " "))
	}
	return result
}

func testTarGz(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var result bytes.Buffer
	gz := gzip.NewWriter(&result)
	tarWriter := tar.NewWriter(gz)
	for name, value := range files {
		if err := tarWriter.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(value))}); err != nil {
			t.Fatal(err)
		}
		if _, err := tarWriter.Write([]byte(value)); err != nil {
			t.Fatal(err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return result.Bytes()
}
