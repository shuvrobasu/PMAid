"""Start PMAID and its configured local AI without keeping a terminal open.

Run: python server.py
Foreground web server for debugging: python server.py --foreground
"""

import http.server
import json
import os
import signal
import socket
import sqlite3
import subprocess
import sys
import threading
from datetime import datetime
from datetime import timezone
from urllib.parse import unquote
from urllib.parse import urlparse

import config_validator


ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_PORT = 8000
DATA_ROOT = os.path.join(ROOT, "data")
DATABASE_PATH = os.path.join(DATA_ROOT, "pmaid.db")
ORG_CONFIG_ROOT = os.path.join(ROOT, "config", "org")
ORG_BUNDLE_PATH = os.path.join(ORG_CONFIG_ROOT, "bundle.json")
MAX_PROJECT_BYTES = 2 * 1024 * 1024
ORG_BUNDLE_FORMAT = "pmaid-org-config"
ORG_BUNDLE_VERSION = 1
ORG_CONFIG_KEYS = {
    "problem_types",
    "ai_patterns",
    "methodologies",
    "phases",
    "tasks",
    "roles",
    "risks",
    "gates",
    "rules",
    "guidance",
    "eu_ai_act",
    "ui",
    "custom_phases",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def initialize_database():
    os.makedirs(DATA_ROOT, exist_ok=True)
    with sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                project_id TEXT PRIMARY KEY,
                project_name TEXT NOT NULL,
                is_sample INTEGER NOT NULL DEFAULT 0,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at)"
        )


def empty_org_bundle():
    return {
        "format": ORG_BUNDLE_FORMAT,
        "version": ORG_BUNDLE_VERSION,
        "config": {},
    }


def validate_library(config, group_name, list_name, id_name, name_name):
    if group_name not in config:
        return None
    group = config[group_name]
    if isinstance(group, dict) is False:
        return "%s must be an object" % group_name
    if list_name not in group:
        return "%s.%s is required" % (group_name, list_name)
    items = group[list_name]
    if isinstance(items, list) is False:
        return "%s.%s must be a list" % (group_name, list_name)
    seen = set()
    for item in items:
        if isinstance(item, dict) is False:
            return "%s entries must be objects" % group_name
        item_id = item.get(id_name)
        if isinstance(item_id, str) is False:
            return "%s.%s must be a string" % (group_name, id_name)
        if item_id.strip() == "":
            return "%s.%s is required" % (group_name, id_name)
        if item_id in seen:
            return "Duplicate %s: %s" % (id_name, item_id)
        seen.add(item_id)
        item_name = item.get(name_name)
        if isinstance(item_name, str) is False:
            return "%s.%s must be a string" % (group_name, name_name)
        if item_name.strip() == "":
            return "%s.%s is required" % (group_name, name_name)
    return None


def validate_org_bundle(bundle):
    if isinstance(bundle, dict) is False:
        return "Organisation bundle must be an object"
    if bundle.get("format") != ORG_BUNDLE_FORMAT:
        return "Unsupported organisation bundle format"
    if bundle.get("version") != ORG_BUNDLE_VERSION:
        return "Unsupported organisation bundle version"
    config = bundle.get("config")
    if isinstance(config, dict) is False:
        return "Organisation bundle config must be an object"
    for key in config:
        if key not in ORG_CONFIG_KEYS:
            return "Unknown organisation config group: %s" % key
    error = validate_library(config, "tasks", "tasks", "task_id", "name")
    if error is not None:
        return error
    error = validate_library(config, "roles", "roles", "role_id", "name")
    if error is not None:
        return error
    error = validate_library(config, "risks", "risks", "risk_id", "title")
    if error is not None:
        return error
    risks_group = config.get("risks")
    if isinstance(risks_group, dict):
        risks = risks_group.get("risks")
        if isinstance(risks, list):
            for risk in risks:
                likelihood = risk.get("default_likelihood")
                impact = risk.get("default_impact")
                if isinstance(likelihood, int) is False:
                    return "Risk likelihood must be an integer from 1 to 5"
                if likelihood < 1:
                    return "Risk likelihood must be an integer from 1 to 5"
                if likelihood > 5:
                    return "Risk likelihood must be an integer from 1 to 5"
                if isinstance(impact, int) is False:
                    return "Risk impact must be an integer from 1 to 5"
                if impact < 1:
                    return "Risk impact must be an integer from 1 to 5"
                if impact > 5:
                    return "Risk impact must be an integer from 1 to 5"
    return None


def load_org_bundle():
    if os.path.isfile(ORG_BUNDLE_PATH) is False:
        return empty_org_bundle()
    with open(ORG_BUNDLE_PATH, "r", encoding="utf-8") as handle:
        bundle = json.load(handle)
    error = validate_org_bundle(bundle)
    if error is not None:
        raise ValueError(error)
    return bundle


def save_org_bundle(bundle):
    error = validate_org_bundle(bundle)
    if error is not None:
        raise ValueError(error)
    saved = {
        "format": ORG_BUNDLE_FORMAT,
        "version": ORG_BUNDLE_VERSION,
        "updated_at": utc_now(),
        "config": bundle["config"],
    }
    os.makedirs(ORG_CONFIG_ROOT, exist_ok=True)
    temporary_path = ORG_BUNDLE_PATH + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as handle:
        json.dump(saved, handle, indent=2, ensure_ascii=False)
    os.replace(temporary_path, ORG_BUNDLE_PATH)
    return saved


class PMAIDRequestHandler(http.server.SimpleHTTPRequestHandler):
    def redirect_to_app(self):
        self.send_response(302)
        self.send_header("Location", "/pages/index.html")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def list_directory(self, path):
        self.send_error(404, "Directory listing is disabled")
        return None

    def send_json(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_empty(self, status):
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def read_json_body(self):
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            self.send_json(411, {"error": "Content-Length is required"})
            return None
        try:
            length = int(raw_length)
        except ValueError:
            self.send_json(400, {"error": "Invalid Content-Length"})
            return None
        if length < 1:
            self.send_json(400, {"error": "Request body is required"})
            return None
        if length > MAX_PROJECT_BYTES:
            self.send_json(413, {"error": "Request is too large"})
            return None
        raw_body = self.rfile.read(length)
        try:
            return json.loads(raw_body.decode("utf-8"))
        except UnicodeDecodeError:
            self.send_json(400, {"error": "Request body must be UTF-8"})
            return None
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Request body must be valid JSON"})
            return None

    def list_projects(self):
        projects = []
        with sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
            rows = connection.execute(
                "SELECT payload FROM projects ORDER BY created_at, project_id"
            ).fetchall()
        for row in rows:
            projects.append(json.loads(row[0]))
        return projects

    def save_project(self, project):
        project_id = project.get("project_id")
        if isinstance(project_id, str) is False:
            self.send_json(400, {"error": "project_id must be a string"})
            return
        if project_id.strip() == "":
            self.send_json(400, {"error": "project_id is required"})
            return
        project_name = project.get("project_name")
        if isinstance(project_name, str) is False:
            project_name = "Untitled Project"
        created_at = project.get("created_at")
        if isinstance(created_at, str) is False:
            created_at = utc_now()
            project["created_at"] = created_at
        updated_at = project.get("updated_at")
        if isinstance(updated_at, str) is False:
            updated_at = utc_now()
            project["updated_at"] = updated_at
        is_sample = 0
        if project_id.startswith("sample_"):
            is_sample = 1
        payload = json.dumps(project, ensure_ascii=False, separators=(",", ":"))
        with sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
            connection.execute(
                """
                INSERT INTO projects (
                    project_id,
                    project_name,
                    is_sample,
                    payload,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    project_name = excluded.project_name,
                    is_sample = excluded.is_sample,
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (
                    project_id,
                    project_name,
                    is_sample,
                    payload,
                    created_at,
                    updated_at,
                ),
            )
        self.send_json(200, project)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            self.redirect_to_app()
            return
        if path == "/api/projects":
            self.send_json(200, self.list_projects())
            return
        if path == "/api/config/org":
            try:
                bundle = load_org_bundle()
            except json.JSONDecodeError:
                self.send_json(500, {"error": "Organisation bundle is not valid JSON"})
                return
            except ValueError as error:
                self.send_json(500, {"error": str(error)})
                return
            self.send_json(200, bundle)
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/exit":
            self.send_json(202, {"message": "PMAID is stopping."})
            worker = threading.Thread(
                target=stop_pmaid_services,
                args=(self.server,),
                daemon=True,
            )
            worker.start()
            return
        if path == "/api/projects":
            project = self.read_json_body()
            if project is None:
                return
            if isinstance(project, dict) is False:
                self.send_json(400, {"error": "Project must be a JSON object"})
                return
            self.save_project(project)
            return
        if path == "/api/config/org":
            bundle = self.read_json_body()
            if bundle is None:
                return
            try:
                saved = save_org_bundle(bundle)
            except ValueError as error:
                self.send_json(400, {"error": str(error)})
                return
            self.send_json(200, saved)
            return
        self.send_json(404, {"error": "API endpoint not found"})

    def do_DELETE(self):
        path = urlparse(self.path).path
        prefix = "/api/projects/"
        if path.startswith(prefix) is False:
            self.send_json(404, {"error": "API endpoint not found"})
            return
        project_id = unquote(path[len(prefix):])
        if project_id == "":
            self.send_json(400, {"error": "project_id is required"})
            return
        with sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
            connection.execute(
                "DELETE FROM projects WHERE project_id = ?",
                (project_id,),
            )
        self.send_empty(204)


def is_listening(host, port):
    try:
        connection = socket.create_connection((host, port), timeout=0.5)
    except OSError:
        return False
    connection.close()
    return True


def listener_pids(port):
    result = subprocess.run(
        ["netstat", "-ano", "-p", "tcp"],
        capture_output=True,
        text=True,
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        return []
    pids = []
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) < 5:
            continue
        if fields[0].upper() != "TCP":
            continue
        if fields[3].upper() != "LISTENING":
            continue
        local_address = fields[1]
        if ":" not in local_address:
            continue
        local_port = local_address.rsplit(":", 1)[1]
        if local_port != str(port):
            continue
        pid_text = fields[4]
        if pid_text.isdigit() is False:
            continue
        pid = int(pid_text)
        if pid not in pids:
            pids.append(pid)
    return pids


def stop_listener_processes(port):
    current_pid = os.getpid()
    for pid in listener_pids(port):
        if pid == current_pid:
            continue
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            continue


def stop_pmaid_services(httpd):
    stop_listener_processes(8080)
    httpd.shutdown()


def spawn_hidden(command):
    options = {
        "cwd": ROOT,
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NO_WINDOW
    else:
        options["start_new_session"] = True
    return subprocess.Popen(command, **options)


def load_local_ai_settings():
    path = os.path.join(ROOT, "config", "cache", "ui.json")
    with open(path, "r", encoding="utf-8") as handle:
        ui = json.load(handle)
    return ui["local_ai"]


def start_local_ai(settings):
    if settings["enabled"] is not True:
        print("Local AI is disabled.")
        return
    endpoint = urlparse(settings["endpoint"])
    host = endpoint.hostname
    if host is None:
        host = "127.0.0.1"
    port = endpoint.port
    if port is None:
        port = 8080
    if is_listening(host, port):
        print("llama.cpp is already listening on port %s." % port)
        return
    server_path = settings["server_path"]
    model_path = settings["model_path"]
    if os.path.isfile(server_path) is False:
        print("llama.cpp server not found: %s" % server_path)
        return
    if os.path.isfile(model_path) is False:
        print("GGUF model not found: %s" % model_path)
        return
    bind_host = host
    if bind_host == "localhost":
        bind_host = "127.0.0.1"
    command = [
        server_path,
        "-m",
        model_path,
        "--host",
        bind_host,
        "--port",
        str(port),
        "-c",
        "16384",
    ]
    process = spawn_hidden(command)
    print("Started llama.cpp in the background with PID %s." % process.pid)


def serve():
    os.chdir(ROOT)
    initialize_database()
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    handler = PMAIDRequestHandler
    with http.server.ThreadingHTTPServer(("127.0.0.1", WEB_PORT), handler) as httpd:
        httpd.serve_forever()


def start_web_server():
    if is_listening("127.0.0.1", WEB_PORT):
        print("PMAID is already listening on port %s." % WEB_PORT)
        return
    command = [sys.executable, os.path.abspath(__file__), "--serve"]
    process = spawn_hidden(command)
    print("Started PMAID in the background with PID %s." % process.pid)


def build_config_cache():
    config_root = os.path.join(ROOT, "config")
    if config_validator.cache_is_current(config_root):
        print("Configuration cache is current. Regeneration skipped.")
        return True
    return config_validator.validate_all(config_root)


def main():
    ok = build_config_cache()
    if ok is False:
        return 1
    if "--serve" in sys.argv[1:]:
        serve()
        return 0
    settings = load_local_ai_settings()
    start_local_ai(settings)
    if "--foreground" in sys.argv[1:]:
        print("PMAID at http://localhost:%s/pages/index.html" % WEB_PORT)
        serve()
        return 0
    start_web_server()
    print("PMAID at http://localhost:%s/pages/index.html" % WEB_PORT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
