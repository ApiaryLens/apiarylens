#!/bin/sh
# Verify an extracted ApiaryLens air-gap bundle before anything is loaded or
# installed (OPREM-001 gap G7), and optionally verify loaded image identity.
#
# Usage:
#   verify-bundle.sh --bundle-dir DIR [--target DIR] [--allow-channel-change]
#                    [--post-load]
#
# Checks, fail-closed (exit 65 on any refusal):
#   1. every bundle member matches checksums.sha256;
#   2. the bundle format version is one this script understands;
#   3. with --target and an active install: the bundle is a supported update
#      source for the installed version and channel (not-newer, downgrade,
#      minimum direct-upgrade, and channel rules from the compatibility
#      manifest, ADR 0021);
#   4. with --post-load: every docker image ID loaded on this host is one of
#      the two identities bundle-manifest.json records for that image — the
#      config-blob digest (what the classic graphdriver image store reports
#      as .Id) or the OCI manifest digest (what the containerd image store,
#      the default on current Docker Engine, reports as .Id). Both are
#      derived from the bundle's own image archive bytes at build time, so
#      either match proves the loaded image is the bundle's image (issues
#      #82, #91).

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

bundle_dir=''
target=''
post_load=false
allow_channel_change=false
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle-dir)
      bundle_dir=$2
      shift 2
      ;;
    --target)
      target=$2
      shift 2
      ;;
    --post-load)
      post_load=true
      shift
      ;;
    --allow-channel-change)
      allow_channel_change=true
      shift
      ;;
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
[ -n "$bundle_dir" ] || al_die 64 "Usage: verify-bundle.sh --bundle-dir DIR [--target DIR] [--allow-channel-change] [--post-load]"

manifest="$bundle_dir/bundle-manifest.json"
for required in bundle-manifest.json compatibility-manifest.json release-identity.json checksums.sha256; do
  [ -f "$bundle_dir/$required" ] || al_die 65 "The bundle is incomplete: $required is missing"
done

al_require_command sha256sum
(cd "$bundle_dir" && sha256sum --check --quiet checksums.sha256) ||
  al_die 65 "Bundle member checksum verification failed; the bundle is corrupted or tampered and must not be used"
al_note "Bundle member checksums verified against checksums.sha256."

bundle_format=$(al_json_require "$manifest" bundleFormat)
[ "$bundle_format" = "1" ] ||
  al_die 65 "Bundle format $bundle_format is newer than this verifier understands; obtain the matching lifecycle scripts first"

version=$(al_json_require "$manifest" productVersion)
channel=$(al_json_require "$manifest" channel)
migration_head=$(al_json_require "$manifest" migrationHead)
minimum_source=$(al_json_require "$manifest" minimumDirectUpgradeSource)
al_note "Bundle identity: ApiaryLens $version ($channel), migration head $migration_head."

if [ -n "$target" ] && [ -e "$target/current/release-identity.json" ]; then
  installed_version=$(al_installed_version)
  installed_channel=$(al_installed_channel)
  case "$(al_compare_versions "$installed_version" "$version")" in
    eq) al_die 65 "ApiaryLens $version is already installed; nothing to update" ;;
    gt) al_die 65 "Installed $installed_version is newer than bundle $version; downgrades require a verified backup restore, not an update" ;;
    lt) : ;;
  esac
  if [ "$(al_compare_versions "$installed_version" "$minimum_source")" = "lt" ]; then
    al_die 65 "Installed $installed_version is older than the minimum directly supported upgrade source $minimum_source"
  fi
  if [ "$installed_channel" != "$channel" ] && [ "$allow_channel_change" != "true" ]; then
    al_die 65 "Installed channel $installed_channel differs from bundle channel $channel; pass --allow-channel-change to opt in explicitly"
  fi
  al_note "Update from $installed_version ($installed_channel) to $version ($channel) is within the supported envelope."
fi

if [ "$post_load" = "true" ]; then
  al_require_command docker
  for pair in api:apiImage:apiImageId:apiImageManifestDigest \
    web:webImage:webImageId:webImageManifestDigest \
    helper:helperImage:helperImageId:helperImageManifestDigest; do
    label=${pair%%:*}
    rest=${pair#*:}
    image_key=${rest%%:*}
    rest=${rest#*:}
    id_key=${rest%%:*}
    digest_key=${rest#*:}
    image=$(al_json_require "$manifest" "$image_key")
    expected_id=$(al_json_require "$manifest" "$id_key")
    expected_manifest_digest=$(al_json_require "$manifest" "$digest_key")
    actual_id=$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null) ||
      al_die 65 "Image $image ($label) is not present after load"
    # The reported .Id is image-store-dependent: the classic graphdriver
    # store reports the config-blob digest, the containerd image store (the
    # current Docker Engine default) reports the OCI manifest digest. Both
    # recorded values are derived from the bundle's own archive bytes, so
    # accepting either keeps the gate store-independent without weakening it.
    if [ "$actual_id" != "$expected_id" ] && [ "$actual_id" != "$expected_manifest_digest" ]; then
      al_die 65 "Image $image ($label) has ID $actual_id but the bundle recorded config digest $expected_id (classic image store) and manifest digest $expected_manifest_digest (containerd image store); refuse to activate (if this host built these images, cached builder/image-store content can mask the bundle's identity: prune the build cache and unused images, then re-run load-images.sh)"
    fi
  done
  al_note "Loaded image IDs match the identities recorded in bundle-manifest.json."
fi

al_note "Bundle verification passed."
