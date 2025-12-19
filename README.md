# Synthetics Worker Helper

![Synthetics Worker Helper](./assets/extension-icon.png)

A small collection of Raycast commands and helper scripts used by the **Synthetics Executing** team during day-to-day development.

## Install

```bash
npm install
```

## Run (Development)

```bash
npm run dev
```

This starts Raycast in development mode and loads the extension.

## Import / Load the extension in Raycast

Recommended:

- Run `npm run dev` (it uses `ray develop` and will load the extension for you).

Alternative:

- Open Raycast → run the **Import Extension** command → select this repository folder.

## Configuration (Raycast Preferences)

In Raycast: **Settings** → **Extensions** → **Synthetics Worker Helper**:

- **Worker Directory (`workerDir`)**: path to the `synthetics-worker` directory where git commands should run
- **Git Username (`gitUsername`)**: used to build branch names (e.g. `username/SYNTH-1234/description`)

## Commands

- **Create Worker Branch from JIRA**: creates a worker branch from a JIRA ticket