def test_healthz_ok_when_k8s_reachable(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["kagent_reachable"] is True


def test_healthz_reports_unreachable(client, fake_k8s, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("cluster unreachable")

    monkeypatch.setattr(fake_k8s, "list", boom)
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["kagent_reachable"] is False


def test_openapi_docs_available(client):
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert resp.json()["info"]["title"] == "Agents Platform API"
