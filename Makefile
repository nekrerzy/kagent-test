SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.ONESHELL:
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables --no-builtin-rules
.DEFAULT_GOAL := help

KUBECTL := kubectl --context admin@homelab

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*?##/ {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: infra-validate
infra-validate: ## Render and lint all infra manifests offline (no cluster changes)
	@for app in infra/argocd/apps/*.yaml infra/argocd/root-app.yaml; do \
		$(KUBECTL) apply --dry-run=client -f $$app -o name >/dev/null || exit 1; \
	done
	@echo "infra manifests OK"

.PHONY: argocd-bootstrap
argocd-bootstrap: ## Apply the ArgoCD root app (the ONLY manual apply; everything else syncs from git)
	$(KUBECTL) apply -f infra/argocd/root-app.yaml

REGISTRY := 10.20.0.1:5050
SCRATCH := $(shell echo $${TMPDIR:-/tmp})

.PHONY: api-build
api-build: ## Build the platform API image
	docker build -f apps/api/Dockerfile -t $(REGISTRY)/platform-api:dev .

.PHONY: api-push
api-push: ## Push API image to the homelab registry (plain HTTP, via crane)
	docker save $(REGISTRY)/platform-api:dev -o $(SCRATCH)/platform-api.tar
	crane push --insecure $(SCRATCH)/platform-api.tar $(REGISTRY)/platform-api:dev
	rm -f $(SCRATCH)/platform-api.tar

.PHONY: api-deploy
api-deploy: api-build api-push ## Build, push, and restart the API deployment
	$(KUBECTL) rollout restart deployment/platform-api -n platform
	$(KUBECTL) rollout status deployment/platform-api -n platform --timeout=120s

.PHONY: smoke
smoke: ## End-to-end smoke test: agent + MCP tool round trip over A2A
	bash scripts/smoke.sh
