# Contributing to this repository

1. Don't edit the Dockerfiles directly. They are generated using templates.
2. Make any changes to the `*.template` files in the root of the repository.
3. Make sure you've checked the [Requirements](#requirements) below.
4. Run the `./apply-templates.sh` script after making your changes.
5. Once complete, (review and) commit all changes to the templates and Dockerfiles.

## Requirements

You will need the following software packages to run the [`./apply-templates.sh`](/apply-templates.sh) script.

- [GNU awk](https://www.gnu.org/software/gawk/) available as `gawk`.
- [`jq`](https://stedolan.github.io/jq/)
- A recent version of Bash

## Updating PHP source archives

Run `node update-php.mjs` with Node.js 22 or newer. It checks PHP.net for new
patch releases in the stable series tracked in `versions.json`, updates the
archive URL, signature URL, and SHA-256, and regenerates the affected Dockerfiles.
The template renderer uses the requirements above and `wget` to fetch its AWK
template helper when needed.

## Publishing PHP images to GHCR

The [GHCR workflow](.github/workflows/publish-ghcr.yml) builds the active stable PHP
versions and variants when image sources change on `master`. You can also run
it manually on `master` to rebuild the matrix. It uses the same tag aliases as
the Docker Official Image metadata and publishes both `linux/amd64` and
`linux/arm64` under each tag.

To retry specific variants, set the workflow's `contexts` input to their
comma-separated paths, for example `8.5/trixie/cli,8.5/alpine3.24/fpm`.

```sh
docker pull ghcr.io/shopwarelabs/docker-php-library:8.5-fpm-alpine
```
