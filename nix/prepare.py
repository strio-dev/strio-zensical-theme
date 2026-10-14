"""Stage a project's docs with packaged theme defaults in a separate directory."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib
from urllib.parse import urlsplit

import tomli_w


def merge(defaults, supplied):
    result = defaults.copy()
    for key, value in supplied.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge(result[key], value)
        elif key in ("extra_css", "extra_javascript"):
            combined = [*result.get(key, []), *value]
            result[key] = []
            for item in combined:
                if item not in result[key]:
                    result[key].append(item)
        else:
            result[key] = value
    return result


def project_path(base, value, root):
    path = Path(os.path.abspath(base / value))
    if not path.is_relative_to(root) or not path.resolve().is_relative_to(root):
        raise ValueError(f"Project path must stay inside the documentation source: {value}")
    return path


def selected_sources(source, values):
    """Validate only explicit inputs; never walk the rest of the project."""
    if values is None:
        return None
    selected = []
    for value in values:
        relative = Path(value)
        if (relative.is_absolute() or value != str(relative) or value == "."
                or ".." in relative.parts or any(c in value for c in "\n\r\t*?[]\\")):
            raise ValueError(f"sourcePaths entries must be plain relative source paths: {value!r}")
        path = project_path(source, value, source)
        if any(parent.is_symlink() for parent in path.parents if parent.is_relative_to(source)):
            raise ValueError(f"Scoped source path must not have a symlink parent: {value}")
        if not path.exists():
            raise ValueError(f"Selected source path does not exist: {value}")
        selected.append(path)
    for path in selected:
        candidates = [path]
        if path.is_dir() and not path.is_symlink():
            for base, directories, files in os.walk(path, followlinks=False):
                candidates.extend(Path(base) / name for name in directories + files)
        for candidate in candidates:
            if candidate.is_symlink():
                target = candidate.resolve()
                if candidate.is_dir() or not target.is_file() or not any(
                    target == item or (item.is_dir() and target.is_relative_to(item))
                    for item in selected
                ):
                    raise ValueError(f"Scoped source symlink must be a file inside sourcePaths: {candidate}")
            elif not candidate.is_dir() and not candidate.is_file():
                raise ValueError(f"Selected source must be a regular file or directory: {candidate}")
    return selected


def require_selected(path, selected):
    if selected is not None and not any(path == item or (item.is_dir() and path.is_relative_to(item))
                                        for item in selected):
        raise ValueError(f"Required project source path is not included in sourcePaths: {path}")


def source_filters(source, selected):
    if selected is None:
        return []
    included = set()
    for path in selected:
        relative = path.relative_to(source)
        included.update(f"/{parent}/" for parent in relative.parents if str(parent) != ".")
        included.add(f"/{relative}/***" if path.is_dir() else f"/{relative}")
    return [*(f"--include={pattern}" for pattern in sorted(included)), "--exclude=*"]



def fingerprint_assets(project, docs, theme_assets, accent_css):
    """Version shared URLs by content so new HTML cannot reuse old theme CSS/JS."""
    assets = {str(path.relative_to(theme_assets)) for path in theme_assets.rglob("*")
              if path.is_file() and path.suffix in (".css", ".js")}
    assets.add(accent_css)
    names = {}
    for name in sorted(assets):
        original = docs / name
        digest = hashlib.sha256(original.read_bytes()).hexdigest()[:12]
        versioned = original.with_name(f"{original.stem}.{digest}{original.suffix}")
        if versioned.exists():
            raise ValueError(f"Shared versioned asset is already in the project source: {versioned.relative_to(docs)}")
        original.rename(versioned)
        names[name] = str(versioned.relative_to(docs))
    for field in ("extra_css", "extra_javascript"):
        project[field] = [names.get(asset, asset) if isinstance(asset, str) else asset
                          for asset in project.get(field, [])]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--theme", type=Path, required=True)
    parser.add_argument("--config-file", default="zensical.toml")
    parser.add_argument("--site-url")
    parser.add_argument("--source-path", action="append")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    if output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("Staging and documentation source must be separate directories")
    selected = selected_sources(source, args.source_path)
    config_path = project_path(source, args.config_file, source)
    require_selected(config_path, selected)
    supplied = tomllib.loads(config_path.read_text())
    config = merge(tomllib.loads((args.theme / "zensical.toml").read_text()), supplied)
    project = config["project"]
    sys.path.insert(0, str(args.theme / "python"))
    from strio_palette import ACCENT_CSS, accent_colors, configure
    accent_colors(project.get("extra", {}).get("strio_accent"))
    if project["theme"]["variant"] != "modern":
        raise ValueError("The Strio theme supports Zensical's modern variant")
    docs = project_path(config_path.parent, project.get("docs_dir", "docs"), source)
    require_selected(docs, selected)
    if not docs.is_dir():
        raise ValueError(f"Documentation directory does not exist: {docs}")
    custom = supplied.get("project", {}).get("theme", {}).get("custom_dir")
    custom_path = project_path(config_path.parent, custom, source) if custom else None
    if custom_path:
        require_selected(custom_path, selected)
    if custom_path and not custom_path.is_dir():
        raise ValueError(f"Template override directory does not exist: {custom_path}")
    for asset in (args.theme / "assets").rglob("*"):
        if asset.is_file() and (docs / asset.relative_to(args.theme / "assets")).exists():
            raise ValueError(f"Shared theme asset is already in the project source: {asset.relative_to(args.theme / 'assets')}")

    if (docs / ACCENT_CSS).exists():
        raise ValueError(f"Shared theme generated asset is already in the project source: {ACCENT_CSS}")

    if args.site_url is not None:
        url = args.site_url.rstrip("/") + "/"
        parsed = urlsplit(url)
        if not (parsed.scheme in ("http", "https") and parsed.hostname):
            raise ValueError("siteUrl must be an absolute HTTP(S) URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment or any(ord(c) < 32 for c in url):
            raise ValueError("siteUrl must not contain credentials, a query, a fragment or control characters")
        project["site_url"] = url

    if args.validate_only:
        return
    output.mkdir(parents=True, exist_ok=True)
    staged = output / "source"
    staged.mkdir(exist_ok=True)
    site_dir = project.get("site_dir", "site")
    site_path = project_path(config_path.parent, site_dir, source)
    output_site = config_path.parent.relative_to(source) / "site"
    subprocess.run([
        "rsync", "-aL", "--delete", "--exclude=/.git/",
        *(["--checksum"] if selected is not None else []),
        f"--exclude=/{config_path.relative_to(source)}",
        f"--exclude=/{output_site}/",
        f"--exclude=/{site_path.relative_to(source)}/",
        *source_filters(source, selected), f"{source}/", f"{staged}/",
    ], check=True)
    subprocess.run(["chmod", "-R", "u+w", str(staged)], check=True)
    staged_docs = staged / docs.relative_to(source)
    subprocess.run(["rsync", "-rtp", "--chmod=Du+rwx,Fu+rw", f"{args.theme / 'assets'}/", f"{staged_docs}/"], check=True)
    configure(project, staged_docs)
    fingerprint_assets(project, staged_docs, args.theme / "assets", ACCENT_CSS)
    licenses = staged_docs / "licenses/strio"
    licenses.mkdir(parents=True, exist_ok=True)
    subprocess.run(["rsync", "-rtp", "--chmod=Du+rwx,Fu+rw", f"{args.theme / 'licenses'}/", f"{licenses}/"], check=True)
    shutil.copyfile(args.theme / "LICENSE", licenses / "LICENSE")
    overrides = output / "overrides"
    overrides.mkdir(exist_ok=True)
    subprocess.run(["rsync", "-rtp", "--chmod=Du+rwx,Fu+rw", "--delete", f"{args.theme / 'overrides'}/", f"{overrides}/"], check=True)
    if custom_path:
        subprocess.run(["rsync", "-rtp", "--chmod=Du+rwx,Fu+rw", f"{staged / custom_path.relative_to(source)}/", f"{overrides}/"], check=True)
    project["site_dir"] = "site"
    project["theme"]["custom_dir"] = str(overrides)
    generated_config = staged / config_path.relative_to(source)
    generated_config.parent.mkdir(parents=True, exist_ok=True)
    temporary_config = generated_config.with_name(generated_config.name + ".tmp")
    temporary_config.write_text(tomli_w.dumps(config))
    temporary_config.replace(generated_config)



if __name__ == "__main__":
    main()
