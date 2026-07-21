from platform_api import mappers
from platform_api.schemas import AgentIn, SkillGitRef, SkillIn


def test_byo_agent_round_trip():
    agent = AgentIn(name="byo-a", type="BYO", image="10.20.0.1:5050/echo:dev")
    crd = mappers.agent_to_crd(agent, namespace="kagent")
    assert crd["spec"] == {
        "type": "BYO",
        "byo": {"deployment": {"image": "10.20.0.1:5050/echo:dev"}},
    }

    crd["status"] = {}
    out = mappers.agent_from_crd(crd, a2a_base="http://gw")
    assert out.type == "BYO"
    assert out.image == "10.20.0.1:5050/echo:dev"
    assert out.system_message is None


def test_agent_skills_round_trip():
    agent = AgentIn(
        name="sk-a",
        system_message="hi",
        skills=[SkillGitRef(url="https://github.com/x/y.git", path="skills/wc", ref="main")],
    )
    crd = mappers.agent_to_crd(agent, namespace="kagent")
    assert crd["spec"]["skills"] == {
        "gitRefs": [{"url": "https://github.com/x/y.git", "path": "skills/wc", "ref": "main"}]
    }
    crd["status"] = {}
    out = mappers.agent_from_crd(crd, a2a_base="http://gw")
    assert out.skills[0].url == "https://github.com/x/y.git"
    assert out.skills[0].path == "skills/wc"


def test_agent_type_validation(client):
    resp = client.post("/v1/agents", json={"name": "no-msg"})
    assert resp.status_code == 422
    resp = client.post("/v1/agents", json={"name": "no-img", "type": "BYO"})
    assert resp.status_code == 422


def test_skill_configmap_round_trip():
    skill = SkillIn(
        name="word-count",
        url="https://github.com/x/y.git",
        path="examples/skills/word-count",
        ref="main",
        description="Counts words",
        tags=["text"],
    )
    cm = mappers.skill_to_configmap(skill, namespace="kagent")
    assert cm["metadata"]["name"] == "skill-word-count"
    assert cm["metadata"]["labels"] == {"platform.kagent.dev/skill": "true"}
    out = mappers.skill_from_configmap(cm)
    assert out.name == "word-count"
    assert out.url == "https://github.com/x/y.git"
    assert out.tags == ["text"]


def test_skills_crud_and_catalog(client):
    payload = {
        "name": "word-count",
        "url": "https://github.com/x/y.git",
        "path": "examples/skills/word-count",
        "description": "Counts words",
    }
    resp = client.post("/v1/skills", json=payload)
    assert resp.status_code == 201

    resp = client.get("/v1/skills")
    assert [s["name"] for s in resp.json()] == ["word-count"]

    resp = client.get("/v1/skills/kagent/word-count")
    assert resp.json()["path"] == "examples/skills/word-count"

    resp = client.get("/v1/catalog")
    assert [s["name"] for s in resp.json()["skills"]] == ["word-count"]

    assert client.delete("/v1/skills/kagent/word-count").status_code == 204
    assert client.get("/v1/skills").json() == []
