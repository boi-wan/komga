[![Open Collective backers and sponsors](https://img.shields.io/opencollective/all/komga?label=OpenCollective%20Sponsors&color=success)](https://opencollective.com/komga) [![GitHub Sponsors](https://img.shields.io/github/sponsors/gotson?label=Github%20Sponsors&color=success)](https://github.com/sponsors/gotson)
[![Discord](https://img.shields.io/discord/678794935368941569?label=Discord&color=blue)](https://discord.gg/TdRpkDu)

[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/gotson/komga?color=blue&label=download&sort=semver)](https://github.com/gotson/komga/releases) [![GitHub all releases](https://img.shields.io/github/downloads/gotson/komga/total?color=blue&label=github%20downloads)](https://github.com/gotson/komga/releases)
[![Docker Pulls](https://img.shields.io/docker/pulls/gotson/komga)](https://hub.docker.com/r/gotson/komga)

[![Translation status](https://hosted.weblate.org/widgets/komga/-/webui/svg-badge.svg)](https://hosted.weblate.org/engage/komga/)

# ![app icon](./.github/readme-images/app-icon.png) Komga

Komga is a media server for your comics, mangas, BDs, magazines and eBooks.

> [!NOTE]
> ### 📖 Why This Fork? (Native PDF.js Reader)
> Upstream Komga rasterizes PDF pages on the server into static PNG/JPEG images. This fork introduces **client-side vector rendering via Mozilla's PDF.js** directly inside the Divina reader:
> 
> * **Vector Clarity**: Crisp text and illustrations at any zoom level without pixelation.
> * **Text Selection & Copy**: Native text layer support allowing you to highlight, search, and copy text.
> * **Zero Server Overhead**: Eliminates server-side CPU and RAM spikes during PDF reading.
> * **Reading Modes**: Fully supported in both paged and continuous (webtoon vertical scroll) modes.
> * **Image Fallback Toggle**: User setting to switch back to server-rendered images for manga or scanned visual comics.
>
> #### Docker Image (Multi-Arch `amd64` / `arm64`)
> ```yaml
> services:
>   komga:
>     image: ghcr.io/boi-wan/komga:1.29.2-pdfjs.1  # or ghcr.io/boi-wan/komga:pdfjs-latest
>     container_name: komga
>     volumes:
>       - /path/to/config:/config
>       - /path/to/data:/data
>     ports:
>       - 25600:25600
>     restart: unless-stopped
> ```

> [!IMPORTANT]
> **Upstream Contribution Policy & Fork Status**  
> Upstream Komga explicitly does not accept AI-generated or AI-assisted pull requests. Because this implementation was developed with LLM pair-programming assistance (architected and directed by a Senior Software Engineer with 12+ years of industry experience), this feature is maintained exclusively as an independent downstream fork out of full respect for the upstream maintainer's project guidelines.

#### Chat on [Discord](https://discord.gg/TdRpkDu)

## Features

- Browse libraries, series and books via a responsive web UI that works on desktop, tablets and phones
- Organize your library with collections and read lists
- Edit metadata for your series and books
- Import embedded metadata automatically
- Webreader with multiple reading modes
- Manage multiple users, with per-library access control, age restrictions, and labels restrictions
- Offers a REST API, many community tools and scripts can interact with Komga
- OPDS v1 and v2 support
- Kobo Sync with your Kobo eReader
- KOReader Sync
- Download book files, whole series, or read lists
- Duplicate files detection
- Duplicate pages detection and removal
- Import books from outside your libraries directly into your series folder
- Import ComicRack `cbl` read lists

## Installation

Refer to the [website](https://komga.org/docs/category/installation) for instructions.

## Documentation

Head over to our [website](https://komga.org) for more information.

## Develop in Komga

Check the [development guidelines](./DEVELOPING.md).

## Translation

[![Translation status](https://hosted.weblate.org/widgets/komga/-/webui/horizontal-auto.svg)](https://hosted.weblate.org/engage/komga/)

## Powered by

[![Jetbrains_logo](./.github/readme-images/jetbrains.svg)](https://www.jetbrains.com/?from=Komga)

Thanks to [JetBrains](https://www.jetbrains.com/?from=Komga) for providing the development environment that helps us develop Komga.

[![Chromatic logo](https://user-images.githubusercontent.com/321738/84662277-e3db4f80-af1b-11ea-88f5-91d67a5e59f6.png)](https://www.chromatic.com)

Thanks to [Chromatic](https://www.chromatic.com/) for providing the visual testing platform that helps us review UI changes and catch visual regressions.

## Credits

The Komga icon is based on an icon made by [Freepik](https://www.freepik.com/home) from www.flaticon.com
