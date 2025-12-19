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
- **Jira Email (`jiraEmail`)** (optional, auto-fill only): your Atlassian account email
- **Jira API Token (`jiraApiToken`)** (optional, auto-fill only): create one at `https://id.atlassian.com/manage-profile/security/api-tokens`
- **Default Jira Project Key (`jiraDefaultProjectKey`)**: used when typing only the issue number (e.g. `23559` → `SYNTH-23559`)

## Commands

- **Create Worker Branch from JIRA**: creates a worker branch from a JIRA ticket
  - You can input **an issue key OR a Jira link**.
  - If Jira Email + API Token are configured, the command will **auto-fill the Description** using the Jira issue summary.
  - The **Jira URL field is optional** and is only used to auto-detect the issue key.

Example Jira ticket: `https://datadoghq.atlassian.net/browse/SYNTH-23559`
