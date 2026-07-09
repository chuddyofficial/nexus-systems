#!/usr/bin/env bash
# Run this once on the VPS (as root) to let Claude connect via SSH key
# instead of a password. Paste the whole thing into the VPS console/terminal,
# or run it after SSHing in yourself.
set -euo pipefail

mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKxb0mLhhb50RRW6ZYjwvNFs2AwdIqJZJ8i79TaHJIAZ nexus-systems-deploy"

if grep -qF "$PUBKEY" /root/.ssh/authorized_keys 2>/dev/null; then
  echo "Key already present."
else
  echo "$PUBKEY" >> /root/.ssh/authorized_keys
  echo "Key added."
fi

echo "Done. SSH key access is now configured for root@$(hostname -I | awk '{print $1}')."
