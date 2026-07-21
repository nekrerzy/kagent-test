# Build context is the REPO ROOT (needs the root uv.lock + workspace pyproject.toml).
# docker build -f apps/api/Dockerfile .

FROM ghcr.io/astral-sh/uv:0.11-python3.13-bookworm-slim AS build

WORKDIR /workspace

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

COPY pyproject.toml uv.lock ./
COPY apps/api/pyproject.toml apps/api/pyproject.toml

# Install dependencies only first, for better layer caching.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --package platform-api

COPY apps/api/src apps/api/src

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --package platform-api

FROM python:3.13-slim AS runtime

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin platform-api
WORKDIR /workspace

COPY --from=build --chown=10001:10001 /workspace/.venv /workspace/.venv
COPY --from=build --chown=10001:10001 /workspace/apps/api/src /workspace/apps/api/src

ENV PATH="/workspace/.venv/bin:${PATH}"

USER 10001

EXPOSE 8000

CMD ["uvicorn", "platform_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
