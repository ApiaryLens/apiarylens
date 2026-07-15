package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type composeAdapter struct{ executor *executor }

func (a *composeAdapter) preflight(ctx context.Context, input request) ([]phase, error) {
	if input.Plan.Operation == "install" && len(input.Secrets["bootstrapToken"]) < 16 {
		err := errors.New("an owner setup code of at least 16 characters is required only while installing")
		return []phase{failed("Verify one-time owner setup protection", err)}, err
	}
	for _, tool := range []string{"ssh", "scp", "ssh-keyscan"} {
		if err := a.executor.runner.Find(tool); err != nil {
			err = fmt.Errorf("OpenSSH tool %s is required; install the operating system OpenSSH client, then retry", tool)
			return []phase{failed("Find secure remote connection tools", err)}, err
		}
	}
	phases := []phase{pass("Find secure remote connection tools", "Found OpenSSH, secure copy, and host-key verification tools.")}
	knownHosts, err := a.verifiedKnownHosts(ctx, input)
	if err != nil {
		return append(phases, failed("Verify pinned server identity", err)), err
	}
	defer os.Remove(knownHosts)
	phases = append(phases, pass("Verify pinned server identity", "The live server key matches the SHA-256 fingerprint in the plan."))
	compose := input.Plan.Compose
	script := []byte("set -eu\nuname -m\ncommand -v docker >/dev/null\ndocker compose version\ndf -Pk /\ndate -u +%s\n")
	output, err := a.executor.runner.Run(ctx, command{
		Executable: "ssh", Args: sshArgs(compose, knownHosts, "sh", "-s"), Stdin: script,
	}, input.Secrets)
	if err != nil {
		return append(phases, failed("Verify Linux and Docker prerequisites", err)), err
	}
	if !strings.Contains(output, "Docker Compose version") {
		err = errors.New("the remote host does not report Docker Compose v2")
		return append(phases, failed("Verify Linux and Docker prerequisites", err)), err
	}
	phases = append(phases,
		pass("Verify Linux and Docker prerequisites", "The host is reachable and reports Docker Engine, Compose v2, disk, architecture, and UTC time."),
		pass("Verify HTTPS deployment policy", "The plan exposes ApiaryLens only at an HTTPS address and never enables default credentials."),
	)
	return phases, nil
}

func (a *composeAdapter) apply(ctx context.Context, input request, manifest releaseManifest) ([]phase, error) {
	knownHosts, err := a.verifiedKnownHosts(ctx, input)
	if err != nil {
		return []phase{failed("Reverify pinned server identity", err)}, err
	}
	defer os.Remove(knownHosts)
	compose := input.Plan.Compose
	phases := []phase{}
	remoteBundle := "/tmp/apiarylens-" + input.Plan.PlanID + ".tar.gz"
	remoteBootstrap := "/tmp/apiarylens-bootstrap-" + input.Plan.PlanID
	remoteAuthRoot := "/tmp/apiarylens-auth-root-" + input.Plan.PlanID
	if input.Plan.Operation == "install" || input.Plan.Operation == "update" {
		artifact, artifactErr := artifactFor(manifest, "compose")
		if artifactErr != nil {
			return []phase{failed("Select verified Compose bundle", artifactErr)}, artifactErr
		}
		temp, tempErr := os.MkdirTemp("", "apiarylens-scout-compose-")
		if tempErr != nil {
			return []phase{failed("Prepare protected staging folder", tempErr)}, tempErr
		}
		defer os.RemoveAll(temp)
		bundle, downloadErr := a.executor.downloadArtifact(ctx, artifact, temp)
		if downloadErr != nil {
			return []phase{failed("Download and verify deployment bundle", downloadErr)}, downloadErr
		}
		phases = append(phases, pass("Download and verify deployment bundle", "The immutable Compose bundle matches the release manifest."))
		destination := fmt.Sprintf("%s@%s:%s", compose.User, compose.Host, remoteBundle)
		args := []string{"-P", strconv.Itoa(compose.Port), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + knownHosts, "--", bundle, destination}
		if _, err = a.executor.runner.Run(ctx, command{Executable: "scp", Args: args}, input.Secrets); err != nil {
			return append(phases, failed("Transfer verified deployment bundle", err)), err
		}
		phases = append(phases, pass("Transfer verified deployment bundle", "The checked bundle was transferred over the pinned SSH connection."))
		if input.Plan.Operation == "install" {
			authRootBytes := make([]byte, 48)
			if _, secretErr := rand.Read(authRootBytes); secretErr != nil {
				return append(phases, failed("Prepare authentication root secret", secretErr)), secretErr
			}
			input.Secrets["authRootSecret"] = base64.RawURLEncoding.EncodeToString(authRootBytes)
			for _, runtimeSecret := range []struct {
				name, value, remote, phase string
			}{
				{"bootstrap", input.Secrets["bootstrapToken"], remoteBootstrap, "one-time owner setup protection"},
				{"auth-root", input.Secrets["authRootSecret"], remoteAuthRoot, "authentication root secret"},
			} {
				secretPath, secretErr := protectedTempFile(runtimeSecret.name, runtimeSecret.value)
				if secretErr != nil {
					return append(phases, failed("Prepare "+runtimeSecret.phase, secretErr)), secretErr
				}
				defer os.Remove(secretPath)
				secretDestination := fmt.Sprintf("%s@%s:%s", compose.User, compose.Host, runtimeSecret.remote)
				secretArgs := []string{"-P", strconv.Itoa(compose.Port), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + knownHosts, "--", secretPath, secretDestination}
				if _, secretErr = a.executor.runner.Run(ctx, command{Executable: "scp", Args: secretArgs}, input.Secrets); secretErr != nil {
					return append(phases, failed("Transfer "+runtimeSecret.phase, secretErr)), secretErr
				}
				phases = append(phases, pass("Transfer "+runtimeSecret.phase, "The runtime-only secret was transferred separately from the release and was not logged."))
			}
		}
	}

	args := sshArgs(compose, knownHosts, "sh", "-s", "--",
		input.Plan.Operation,
		base64.RawURLEncoding.EncodeToString([]byte(compose.TargetDirectory)),
		base64.RawURLEncoding.EncodeToString([]byte(compose.ProjectName)),
		base64.RawURLEncoding.EncodeToString([]byte(compose.PublicURL)),
		base64.RawURLEncoding.EncodeToString([]byte(manifest.ProductVersion)),
		base64.RawURLEncoding.EncodeToString([]byte(remoteBundle)),
		strconv.FormatBool(input.Plan.KeepDataOnUninstall),
		base64.RawURLEncoding.EncodeToString([]byte(remoteBootstrap)),
		base64.RawURLEncoding.EncodeToString([]byte(remoteAuthRoot)),
	)
	output, err := a.executor.runner.Run(ctx, command{Executable: "ssh", Args: args, Stdin: []byte(composeRemoteScript)}, input.Secrets)
	if err != nil {
		return append(phases, failed("Apply remote Compose operation", err)), err
	}
	phases = append(phases, pass("Apply remote Compose operation", strings.TrimSpace(output)))
	if input.Plan.Operation == "install" || input.Plan.Operation == "update" {
		if err = (&cloudflareAdapter{executor: a.executor}).verifyHealth(ctx, strings.TrimSuffix(compose.PublicURL, "/")+"/health", manifest.ProductVersion); err != nil {
			return append(phases, failed("Verify public HTTPS health", err)), err
		}
		phases = append(phases, pass("Verify public HTTPS health", "The remote deployment reports the expected ApiaryLens release over HTTPS."))
	}
	return phases, nil
}

func (a *composeAdapter) verifiedKnownHosts(ctx context.Context, input request) (string, error) {
	compose := input.Plan.Compose
	output, err := a.executor.runner.Run(ctx, command{Executable: "ssh-keyscan", Args: []string{"-p", strconv.Itoa(compose.Port), "-T", "8", compose.Host}}, input.Secrets)
	if err != nil {
		return "", fmt.Errorf("could not read the server host key: %w", err)
	}
	matched := false
	for _, line := range strings.Split(output, "\n") {
		if strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		key, decodeErr := base64.StdEncoding.DecodeString(fields[2])
		if decodeErr != nil {
			continue
		}
		digest := sha256.Sum256(key)
		fingerprint := "SHA256:" + base64.RawStdEncoding.EncodeToString(digest[:])
		if fingerprint == compose.SSHHostKeySha256 {
			matched = true
			break
		}
	}
	if !matched {
		return "", errors.New("the live SSH host key does not match the fingerprint in the deployment plan")
	}
	file, err := os.CreateTemp("", "apiarylens-known-hosts-")
	if err != nil {
		return "", err
	}
	path := file.Name()
	if err = file.Chmod(0o600); err == nil {
		_, err = file.WriteString(output)
	}
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		_ = os.Remove(path)
		return "", errors.Join(err, closeErr)
	}
	return path, nil
}

func sshArgs(target *compose, knownHosts string, remote ...string) []string {
	args := []string{"-p", strconv.Itoa(target.Port), "-o", "BatchMode=yes", "-o", "IdentitiesOnly=no", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + knownHosts, "--", target.User + "@" + target.Host}
	return append(args, remote...)
}

func protectedTempFile(name, value string) (string, error) {
	secret, err := os.CreateTemp("", "apiarylens-"+name+"-")
	if err != nil {
		return "", err
	}
	path := secret.Name()
	if err = secret.Chmod(0o600); err == nil {
		_, err = secret.WriteString(value)
	}
	err = errors.Join(err, secret.Close())
	if err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

const composeRemoteScript = `set -eu
umask 077
decode() { printf '%s' "$1" | tr '_-' '/+' | base64 -d; }
operation=$1
target=$(decode "$2")
project=$(decode "$3")
public_url=$(decode "$4")
version=$(decode "$5")
bundle=$(decode "$6")
keep_data=$7
bootstrap_file=$(decode "$8")
auth_root_file=$(decode "$9")
release_dir="$target/releases/$version"
current="$target/current"
backups="$target/backups"
secrets_dir="$target/secrets"

safe_backup() {
  mkdir -p "$backups"
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  destination="$backups/$version-$stamp"
  mkdir -p "$destination"
  if [ -f "$secrets_dir/auth-root" ]; then cp "$secrets_dir/auth-root" "$destination/auth-root"; fi
  if [ -f "$current/docker/compose.yaml" ]; then
    docker compose -p "$project" -f "$current/docker/compose.yaml" stop api
    trap 'docker compose -p "$project" -f "$current/docker/compose.yaml" start api >/dev/null 2>&1 || true' EXIT
  fi
  docker run --rm -v "${project}_apiarylens_data:/data:ro" -v "$destination:/backup" alpine:3.22 sh -c 'cd /data && tar czf /backup/data.tar.gz .'
  gzip -t "$destination/data.tar.gz"
  tar tzf "$destination/data.tar.gz" >/dev/null
  if [ -f "$current/release-manifest.json" ]; then cp "$current/release-manifest.json" "$destination/"; fi
  if [ -f "$current/docker/compose.yaml" ]; then
    docker compose -p "$project" -f "$current/docker/compose.yaml" start api
    trap - EXIT
  fi
  printf '%s\n' "$destination"
}

case "$operation" in
  install|update)
    previous=''
    if [ -L "$current" ]; then previous=$(readlink -f "$current"); fi
    if [ "$operation" = update ] && [ -n "$previous" ]; then safe_backup >/dev/null; fi
    mkdir -p "$release_dir"
    tar xzf "$bundle" -C "$release_dir"
    rm -f "$bundle"
    mkdir -p "$secrets_dir"
    if [ "$operation" = install ]; then
      test -s "$bootstrap_file"
      test -s "$auth_root_file"
      mv "$bootstrap_file" "$secrets_dir/bootstrap-token"
      if [ -f "$secrets_dir/auth-root" ]; then rm -f "$auth_root_file"
      else mv "$auth_root_file" "$secrets_dir/auth-root"; fi
      chmod 600 "$secrets_dir/bootstrap-token"
      chmod 600 "$secrets_dir/auth-root"
    fi
    printf 'APIARYLENS_VERSION=%s\nAPIARYLENS_SITE_ADDRESS=%s\nAPIARYLENS_BOOTSTRAP_SECRET_FILE=%s\nAPIARYLENS_AUTH_ROOT_SECRET_FILE=%s\n' "$version" "${public_url#https://}" "$secrets_dir/bootstrap-token" "$secrets_dir/auth-root" > "$release_dir/docker/.env"
    chmod 600 "$release_dir/docker/.env"
    ln -sfn "$release_dir" "$current.next"
    if ! docker compose -p "$project" --env-file "$release_dir/docker/.env" -f "$release_dir/docker/compose.yaml" up -d --build --wait; then
      rm -f "$current.next"
      if [ -n "$previous" ]; then docker compose -p "$project" -f "$previous/docker/compose.yaml" up -d --wait || true; fi
      exit 42
    fi
    mv -Tf "$current.next" "$current"
    printf 'ApiaryLens %s is active and Docker health checks passed.\n' "$version"
    ;;
  backup|export)
    destination=$(safe_backup)
    printf 'Verified data and media archive: %s\n' "$destination"
    ;;
  restore)
    latest=$(find "$backups" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)
    [ -n "$latest" ] && gzip -t "$latest/data.tar.gz"
    docker compose -p "$project" -f "$current/docker/compose.yaml" down
    if [ -f "$latest/auth-root" ]; then mkdir -p "$secrets_dir"; cp "$latest/auth-root" "$secrets_dir/auth-root"; chmod 600 "$secrets_dir/auth-root"; fi
    docker run --rm -v "${project}_apiarylens_data:/data" -v "$latest:/backup:ro" alpine:3.22 sh -c 'rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null || true; tar xzf /backup/data.tar.gz -C /data'
    docker compose -p "$project" -f "$current/docker/compose.yaml" up -d --wait
    printf 'The latest verified backup was restored and health checks passed.\n'
    ;;
  uninstall)
    if [ -f "$current/docker/compose.yaml" ]; then
      if [ "$keep_data" = true ]; then docker compose -p "$project" -f "$current/docker/compose.yaml" down
      else docker compose -p "$project" -f "$current/docker/compose.yaml" down -v; rm -rf "$secrets_dir"; fi
    fi
    printf 'ApiaryLens services were removed; keep-data=%s.\n' "$keep_data"
    ;;
  *) printf 'Unsupported operation\n' >&2; exit 64 ;;
esac
`
