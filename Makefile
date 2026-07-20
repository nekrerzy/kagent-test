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

.PHONY: smoke
smoke: ## End-to-end smoke test: agent + MCP tool round trip (Phase 0: manual checks; scripted in Phase 1)
	@echo "TODO(phase-1): scripted smoke test" && exit 1
