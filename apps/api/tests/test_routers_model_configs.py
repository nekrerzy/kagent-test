def test_create_model_config_never_returns_api_key(client, fake_k8s):
    payload = {
        "name": "default-model-config",
        "namespace": "kagent",
        "provider": "OpenAI",
        "model": "qwen3.6-35b-a3b",
        "base_url": "http://10.20.0.1:9292/v1",
        "api_key": "sk-local-dummy",
    }
    resp = client.post("/v1/model-configs", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "api_key" not in body
    assert body["model"] == "qwen3.6-35b-a3b"
    assert body["base_url"] == "http://10.20.0.1:9292/v1"

    # Secret was written with the expected name/key.
    assert fake_k8s.secrets[("kagent", "default-model-config-apikey")] == {"apiKey": "sk-local-dummy"}


def test_update_model_config_without_api_key_preserves_secret_ref(client, fake_k8s):
    client.post(
        "/v1/model-configs",
        json={"name": "mc1", "namespace": "kagent", "model": "m1", "api_key": "secret-1"},
    )
    resp = client.put(
        "/v1/model-configs/kagent/mc1",
        json={"name": "mc1", "namespace": "kagent", "model": "m2"},
    )
    assert resp.status_code == 200
    assert resp.json()["model"] == "m2"
    # Secret unchanged (not rotated) since api_key wasn't supplied on update.
    assert fake_k8s.secrets[("kagent", "mc1-apikey")] == {"apiKey": "secret-1"}


def test_delete_model_config_deletes_secret(client, fake_k8s):
    client.post(
        "/v1/model-configs",
        json={"name": "mc1", "namespace": "kagent", "model": "m1", "api_key": "secret-1"},
    )
    resp = client.delete("/v1/model-configs/kagent/mc1")
    assert resp.status_code == 204
    assert ("kagent", "mc1-apikey") not in fake_k8s.secrets
