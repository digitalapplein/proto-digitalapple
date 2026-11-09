# Vodafone business case, hosted (v2: Marketing Digital Toolkit; v1 kept at /v1/)

A Render web service (not the static proto site) runs `node server.js` from this folder.
It serves the tool and saves the Discussion page answers and attachments on the service disk (`DATA_DIR`, mounted at /data):
`discuss.json` (current answers), `discuss-log.jsonl` (every change), `files/` (uploads).

Settings on the service: `DATA_DIR=/data`, `ACCESS_KEY` (people open `/?k=<key>` once; a cookie keeps them in).
`/api/export` returns all answers as JSON.

Source of truth for the tool: `Claude Projects/Custom Agents/Vodafone AI Automation/review/business-case-tool/`. Copy changes here, then push.
