# Self-Update — smart-chrome-tool (MockKit)

> Periodic + on-demand update from GitHub Releases. Part of the feature
> catalog — see [`README.md`](./README.md) for the index and master-switch
> model.

## Self-update from GitHub Releases (§11)

**Summary:** Periodically (6h alarm) and on-demand check GitHub Releases for a
newer version. API-first with HTML-scrape fallback (rate-limit resilient).
Download/unzip/write runs in a top-level extension page (`#update=1…`) because
the File System Access API is blocked in third-party iframes. Apply triggers
`chrome.runtime.reload()` + target-tab refresh.

**Lives in:**
- Check + fetch: `service_worker.js` (`checkForUpdate`,
  `fetchLatestRelease`, `fetchLatestReleaseViaHtml`, `compareVersions`)
- Download/unzip/write: `html/iframePage/main/utils/selfUpdate.ts`,
  `components/UpdateModal/`
- Storage: `ajaxToolsUpdateAvailable`, `ajaxToolsUpdateLastCheckAt`,
  `ajaxToolsGithubToken`
- Messages: `CHECK_UPDATE`, `RELOAD_EXTENSION`, `SET_GITHUB_TOKEN`

---

**Related:** [`setup.md`](../setup/setup.md) (publish flow) · [storage keys](../reference/storage-keys.md) · [message types](../reference/message-types.md)
