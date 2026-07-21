# Local image registry (10.20.0.1:5050)

Locally built platform images (API, portal) are served to the Talos cluster from a
plain-HTTP registry on the host, bound to the Talos docker bridge:

```sh
docker --context default run -d --name platform-registry --restart=always \
  -p 10.20.0.1:5050:5000 -v platform-registry:/var/lib/registry registry:3
```

Pushing does not require docker daemon config — `make api-push` uses
`crane push --insecure` on a `docker save` tarball.

## One-time Talos node configuration (manual)

Talos containerd only pulls from HTTPS registries unless a mirror is declared in
machine config. Apply this patch to **all four nodes** (config lives per node):

```sh
cat > /tmp/registry-patch.yaml <<'EOF'
machine:
  registries:
    mirrors:
      "10.20.0.1:5050":
        endpoints:
          - http://10.20.0.1:5050
EOF

for node in 10.20.0.2 10.20.0.3 10.20.0.4 10.20.0.5; do
  talosctl -n "$node" patch machineconfig --patch @/tmp/registry-patch.yaml --mode=no-reboot
done
```

If Talos rejects `--mode=no-reboot` for registry changes, rerun with
`--mode=reboot` one node at a time (workers first, control plane last) and wait
for `kubectl get nodes` to show Ready between nodes.

Verify from the cluster:

```sh
kubectl --context admin@homelab run pull-test --rm -i --restart=Never \
  --image=10.20.0.1:5050/scope-test:v1 -- true
```
