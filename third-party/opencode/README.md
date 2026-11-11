# OpenCode CLI

The production image includes the official OpenCode CLI release `v1.19.5` from
[`anomalyco/opencode`](https://github.com/anomalyco/opencode). The Dockerfile
fetches the release asset at build time and verifies its SHA-256 before use.

Pinned Linux musl assets:

- `opencode-linux-arm64-musl.tar.gz` — `3522eccafd30d84a2d770b72a56d4877c576b9072b36a5a9ea0fa30ed82b896e`
- `opencode-linux-x64-musl.tar.gz` — `e8d5be23bf8f3f69bc3206f3311215c049329cd6afa7c06d733987cc2d33b568`

The CLI integration uses `opencode run --model <provider/model> --format default`
and pipes the prompt on stdin. Compatibility was checked against the official
CLI help and source for this pinned release. The image build does not send a
model request.

See [LICENSE](LICENSE) for the required MIT notice.
