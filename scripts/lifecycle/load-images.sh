#!/bin/sh
# Load the prebuilt product images from an extracted air-gap bundle and verify
# that the loaded image IDs are exactly the ones the bundle recorded.
#
# Usage: load-images.sh --bundle-dir DIR

set -eu
script_dir=$(dirname "$0")
. "$script_dir/lib.sh"

bundle_dir=''
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle-dir)
      bundle_dir=$2
      shift 2
      ;;
    *) al_die 64 "Unknown argument: $1" ;;
  esac
done
[ -n "$bundle_dir" ] || al_die 64 "Usage: load-images.sh --bundle-dir DIR"

manifest="$bundle_dir/bundle-manifest.json"
[ -f "$manifest" ] || al_die 65 "The bundle is incomplete: bundle-manifest.json is missing"
archive=$(al_json_require "$manifest" imagesArchive)
[ -f "$bundle_dir/$archive" ] || al_die 65 "The bundle is incomplete: $archive is missing"

al_require_command docker
docker load -i "$bundle_dir/$archive"
"$script_dir/verify-bundle.sh" --bundle-dir "$bundle_dir" --post-load
