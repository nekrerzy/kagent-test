from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from kubernetes.client.exceptions import ApiException

from platform_api.k8s import K8sClient


def _client_with_custom(custom: MagicMock) -> K8sClient:
    k8s = K8sClient.__new__(K8sClient)
    k8s._custom = custom
    k8s._config_error = None
    k8s._require_config = lambda: None
    return k8s


def test_replace_retries_on_conflict_with_fresh_resource_version():
    custom = MagicMock()
    custom.replace_namespaced_custom_object.side_effect = [
        ApiException(status=409, reason="Conflict"),
        {"metadata": {"resourceVersion": "3"}},
    ]
    custom.get_namespaced_custom_object.return_value = {"metadata": {"resourceVersion": "2"}}

    k8s = _client_with_custom(custom)
    body = {"metadata": {"resourceVersion": "1"}, "spec": {}}
    result = k8s.replace("modelconfigs", "kagent", "x", body)

    assert result == {"metadata": {"resourceVersion": "3"}}
    assert body["metadata"]["resourceVersion"] == "2"
    assert custom.replace_namespaced_custom_object.call_count == 2


def test_replace_gives_up_after_repeated_conflicts():
    custom = MagicMock()
    custom.replace_namespaced_custom_object.side_effect = ApiException(
        status=409, reason="Conflict"
    )
    custom.get_namespaced_custom_object.return_value = {"metadata": {"resourceVersion": "2"}}

    k8s = _client_with_custom(custom)
    with pytest.raises(HTTPException) as exc_info:
        k8s.replace("modelconfigs", "kagent", "x", {"metadata": {}, "spec": {}})
    assert exc_info.value.status_code == 409
    assert custom.replace_namespaced_custom_object.call_count == 3
