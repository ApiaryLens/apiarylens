# Cloud VM Docker Compose

ApiaryLens uses one provider-neutral Docker Compose release on Azure, Amazon Web
Services (AWS), Google Cloud Platform (GCP), a local VM, or personally controlled
hardware. The provider supplies only the Linux VM, network, disk, DNS, and billing.
ApiaryLens product behavior, data ownership, release artifacts, backup format, and
Scout Bee plan stay the same.

## Supported family envelope

| Requirement | Supported baseline |
|---|---|
| Operating system | Ubuntu Server 24.04 LTS, x86-64 |
| Compute | 2 vCPU and 4 GiB RAM recommended |
| Persistent storage | 32 GiB minimum; increase for originals, backups, and Docker images |
| Container runtime | Current supported Docker Engine and Compose v2 plugin |
| Public service | DNS name plus TCP 80 and 443 to the VM |
| Administration | SSH public-key authentication; restrict TCP 22 to operator source addresses |
| Time | UTC-capable system clock synchronized by the host OS |
| Outbound access | HTTPS for release/image retrieval, updates, and ACME |

The reference Azure `Standard_B2s` run used 2 vCPU and 4 GiB RAM. At quiet family
load the two containers used 54.74 MiB combined memory and 0.00% sampled CPU. Those
measurements are not a sizing promise: media, concurrent users, image builds,
backups, operating-system updates, and Docker cache require headroom.

Budget for the VM, persistent disk and snapshots, public IPv4 where charged, DNS,
backup storage, egress, taxes, and optional monitoring. Provider credits and free
allowances change and are never an ApiaryLens availability or cost guarantee.

## Common host preparation

Create a non-root SSH user with public-key authentication and passwordless `sudo`
for the bounded install operation. Install Docker Engine from Docker's supported
Ubuntu repository and verify the exact prerequisites Scout Bee checks:

```bash
uname -m
docker version
docker compose version
df -Pk /
date -u +%s
sudo ss -lntp
```

Before deployment, confirm:

- `uname -m` reports `x86_64`.
- Docker commands succeed and `docker compose version` reports v2.
- TCP 80 and 443 are not occupied by another process.
- `/opt/apiarylens` does not exist, or is an empty normal directory the deployment
  user owns; Scout Bee rejects symlinks and foreign-owned targets.
- the final DNS name resolves to the VM and can receive public ACME validation.
- the SSH host-key SHA-256 fingerprint was collected through a trusted provider
  console or an independently verified channel.

Use the direct Compose procedure available today. Verify the host identity and
release bundle before transfer, keep secrets out of command history, and verify
`/health` against the expected release identity after startup. The commands are
documented in
[`docker/README.md`](../../docker/README.md).

Scout Bee will provide the guided Windows-to-Linux workflow when its separate
end-user release is ready.

## Provider prerequisites

### Microsoft Azure

Create an Ubuntu 24.04 LTS Generation 2 VM with a persistent OS disk and SSH public
key. Use a Network Security Group that exposes TCP 80 and 443 publicly and restricts
TCP 22 to the operator's source range. Assign a stable public address and point the
chosen DNS name at it. Azure documents Linux VM creation and SSH/network checks in
its [Linux VM quickstart](https://learn.microsoft.com/azure/virtual-machines/linux/quick-create-portal)
and [Linux VM connection guide](https://learn.microsoft.com/azure/virtual-machines/linux-vm-connect).

Verified rc.4 evidence: the exact signed public Scout and Compose bundle completed a
clean install on disposable Ubuntu 24.04, reported the expected HTTPS release,
source, and migration, passed all 13 phases, then completed all eight uninstall
phases and left the resource group absent. See
[`rc4-exact-public-deployment-smoke-2026-07-16.json`](../testing/rc4-exact-public-deployment-smoke-2026-07-16.json).

### Amazon Web Services

Launch an EC2 instance from Canonical Ubuntu Server 24.04 LTS (x86-64), attach at
least 32 GiB of persistent EBS storage, associate a stable public address or DNS
name, and use an SSH key pair. The security group must allow TCP 80 and 443 from the
intended clients and TCP 22 only from the operator source range. AWS documents the
instance lifecycle in [Launch an EC2 instance](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/LaunchingAndUsingInstances.html)
and explicitly warns against world-open SSH in
[Create a security group](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html).

Provider-specific Scout automation is not required. The ordinary SSH Compose plan
and the common verification commands above are the acceptance path.

### Google Cloud Platform

Create a Compute Engine instance using Ubuntu 24.04 LTS (x86-64), a persistent boot
disk of at least 32 GiB, an SSH-enabled operator identity, and a stable external IP or
DNS name. Apply narrowly scoped firewall rules for SSH and public TCP 80/443; Google
documents Ubuntu 24.04 selection in
[Create a Linux VM](https://cloud.google.com/compute/docs/create-linux-vm-instance)
and the HTTP/HTTPS firewall behavior in
[Create an instance in a specific subnet](https://cloud.google.com/compute/docs/instances/create-vm-specific-subnet).

Provider-specific Scout automation is not required. Use the same ordinary SSH
Compose plan and common verification commands used on Azure and local VMs.

## Compatibility acceptance record

A provider is recorded as compatible only after a disposable VM passes all of the
following with the exact public release bytes:

1. release manifest, bundle digest, and attestation verification;
2. Scout Bee remote preflight with pinned SSH host identity;
3. clean `/opt/apiarylens` install and exact public HTTPS `/health` identity;
4. first-owner setup, roles, primary records, private media, synchronization,
   explicit conflict, complete export, backup, and clean-environment restore;
5. seeded-predecessor update, backup-before-update, interrupted-update resume, and
   compatible restore;
6. redacted diagnostics with no secrets or user data; and
7. keep-data uninstall/reinstall, final uninstall, and provider resource cleanup.

Azure has a complete recorded pass. AWS and GCP remain unaccepted until their
provider-hosted disposable runs produce the same evidence; documentation and local
Linux similarity are not substitutes for those runs.
