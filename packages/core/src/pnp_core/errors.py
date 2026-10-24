"""Error types shared by the render pipeline. Each carries a stable API error code."""


class PnpError(Exception):
    code: str = "pnp_error"


class UnsafePathError(PnpError):
    code = "invalid_path"


class ManifestError(PnpError):
    code = "validation_error"


class SceneNotFoundError(PnpError):
    code = "scene_not_found"


class ProbeError(PnpError):
    code = "probe_error"


class NotFoundError(PnpError):
    code = "not_found"


class ConflictError(PnpError):
    """The client's If-Match etag no longer matches the file on disk."""

    code = "conflict"


class AlreadyExistsError(PnpError):
    code = "already_exists"


class UnsupportedFileError(PnpError):
    """Binary or non-UTF-8 file: the editor only handles text."""

    code = "unsupported_file"


class FileTooLargeError(PnpError):
    code = "payload_too_large"


class StorageError(PnpError):
    """The file system refused an operation (permission denied, disk full, ...)."""

    code = "storage_error"
