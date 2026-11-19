# Setup guide

About 15 minutes the first time. You need a Google account. Telegram is optional.

**Contents**
1. [Import the sheet](#1-import-the-sheet)
2. [Add the code](#2-add-the-code)
3. [Run the one-time setup](#3-run-the-one-time-setup)
4. [Open the dashboard](#4-open-the-dashboard)
5. [Daily email digest](#5-daily-email-digest)
6. [Telegram alerts (24x7)](#6-telegram-alerts-24x7)
7. [Notification sounds on your phone](#7-notification-sounds-on-your-phone)
8. [Using the dashboard](#8-using-the-dashboard)
9. [Updating the code later](#9-updating-the-code-later)
10. [Optional: deploy with clasp](#10-optional-deploy-with-clasp)
11. [Troubleshooting](#11-troubleshooting)
12. [Uninstall](#12-uninstall)

---

## 1. Import the sheet

1. Download [`template/Danger_Zone_Tasks.xlsx`](../template/Danger_Zone_Tasks.xlsx).
2. Go to [sheets.google.com](https://sheets.google.com) and create a **Blank spreadsheet**.
3. Choose **File → Import → Upload**, select the file, choose **Replace spreadsheet**, then **Import data**.
4. Choose **File → Settings → Time zone** and pick your own time zone. **Deadlines will be wrong without this.**

The sheet has two tabs:
- **Tasks:** type only in the dark-blue columns (Task, Danger, Deadline, Status, Category, Notes). The purple columns (Hours Left, Urgency, Done On) fill themselves in.
- **How to use:** a short guide. Rows 2–6 of Tasks are examples you can delete.

> Setting up from a blank sheet instead? Skip the import. Step 3's `setupSheet` creates the Tasks tab with all formulas, dropdowns and colours.

## 2. Add the code

1. In the sheet, choose **Extensions → Apps Script**.
2. **Code.gs:** delete the placeholder code and paste in all of [`apps-script/Code.gs`](../apps-script/Code.gs).
3. **Telegram.gs:** click **＋ → Script**, name it `Telegram`, and paste in [`apps-script/Telegram.gs`](../apps-script/Telegram.gs). Add this even if you skip Telegram, because the menu refers to it.
4. **Dashboard.html:** click **＋ → HTML**, name it exactly `Dashboard` (Google adds `.html`), and paste in [`apps-script/Dashboard.html`](../apps-script/Dashboard.html).
5. Click **💾 Save**.
6. Click **⚙️ Project Settings** and set **Time zone** to the same zone as the sheet.

*Optional:* in Project Settings, tick **Show "appsscript.json" manifest file in editor**, then replace its contents with [`apps-script/appsscript.json`](../apps-script/appsscript.json). Change `"timeZone"` to yours. The manifest also records the web app access settings (only you, running as you) for anyone deploying with clasp.

## 3. Run the one-time setup

1. At the top of the editor, choose `setupSheet` from the function dropdown and click **▶ Run**.
2. Google asks for permission:
   1. Click **Review permissions** and choose your account.
   2. You'll see **"Google hasn't verified this app"**. That's expected for a script in your own sheet. Click **Advanced → Go to (project name) (unsafe)**.
   3. Click **Allow**.
3. Go back to the sheet tab and **reload** it. A new **⚡ Danger Zone** menu appears in the menu bar.

**What the permissions are for:** reading and writing this spreadsheet, showing the dashboard, sending your digest email *to yourself*, running scheduled triggers, and contacting `api.telegram.org`. Nothing is sent anywhere else.

## 4. Open the dashboard

**Inside the sheet:** choose **⚡ Danger Zone → 🚀 Open dashboard**.

**As its own app (recommended, works on your phone):**
1. In Apps Script, choose **Deploy → New deployment**.
2. Click ⚙️ next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Only myself**, then click **Deploy**.
4. Copy the **Web app URL**.
   - **Phone:** open it in Chrome (Android) or Safari (iPhone), then **⋮ / Share → Add to Home screen**.
   - **Computer:** bookmark it and **pin the tab**. In-browser alarms only play while it's open.

Tap the **enter** button the first time you open it. Browsers only allow sound after a tap.

## 5. Daily email digest

Choose **⚡ Danger Zone → 📧 Turn ON daily 8 AM email reminder**.

Every morning you'll get your top task plus everything overdue, due in 24 hours, or marked critical. If Telegram is connected, the same summary arrives there. To check it right away, choose **📨 Send me the reminder email now**. Use **🔕 Turn OFF** to stop it.

## 6. Telegram alerts (24x7)

These run on Google's servers every minute, so they work with the dashboard closed and your phone locked.

### 6.1 Create a bot (2 minutes)
1. In Telegram, open **@BotFather** and send `/newbot`.
2. Pick a display name (e.g. *My Danger Zone*) and a username ending in `bot`.
3. BotFather replies with a **token** like `123456789:AAH...`.

> 🔒 **Keep the token secret.** Anyone who has it controls your bot. Don't commit it, paste it into chats, or put it in the sheet. The script stores it in *Script Properties*, which only you can see.

### 6.2 Connect it
1. In the sheet, choose **⚡ Danger Zone → 🤖 Connect Telegram (24x7 alerts)** and paste the token.
2. When asked, open your bot in Telegram and tap **START** (or send `/start`).
3. Click **OK** in the sheet. Approve the extra permissions if Google asks.
4. Choose **⚡ Danger Zone → 🔔 Send a test Telegram alert**. Your phone should buzz 3 times.

Only the chat that sent `/start` during setup is linked; messages from anyone else are ignored. To re-link, run Connect again.

### 6.3 What you'll get

| When | Pings | Skipped if you've started the task? |
|---|---|---|
| 3 hrs left | 1 | yes |
| 1 hr left | 1 | yes |
| 10 min left | 2 | sends 1 calm ping instead |
| 5 min left (meltdown) | 3 in a row | yes |
| Deadline passed | 4 in a row | sends 1 calm ping instead |
| Still overdue (High/Critical) | 1 every 30 min | yes |

- **Buttons:** ▶ on it (stops that task's alerts) · ✅ done · 😴 snooze 30 min. Buttons respond within about a minute.
- **Commands:** send any message to add it as a task · `/list` shows what's urgent · `/quiet` mutes pings for 1 hour · `/loud` turns them back on · `/help`.
- **Quiet hours, 11 PM–7 AM:** only deadlines ≤ 10 min away or just passed come through. To change this, edit `TG_QUIET_START` / `TG_QUIET_END` at the top of `Telegram.gs`.
- To disconnect, choose **⚡ Danger Zone → 🔌 Disconnect Telegram**.

## 7. Notification sounds on your phone

The [`sounds/`](../sounds/) folder has 7 MP3s rendered from the dashboard's sound engine. All are under Telegram's limit of 5 seconds and 300 KB.

1. Download one to your phone (the recommended alarm is `dz_ALARM_meltdown.mp3`).
2. In Telegram, send it to **Saved Messages**, long-press it (or tap **⋮**) and choose **Save for notifications**.
3. Open your bot's chat, tap its name, then **Notifications → Sound**, and pick the file.
4. Make sure the alerts can get through:
   - **Android:** Settings → Apps → Telegram → Notifications → turn on **Override Do Not Disturb**.
   - **iPhone:** Settings → Focus → your focus mode → Apps → add **Telegram**.
   - Never mute the bot chat.

## 8. Using the dashboard

| Control | What it does |
|---|---|
| **main quest rn** box | Your single most urgent task. Do this one. |
| **not feeling it → next** | Shows the next task without hiding anything. |
| **▶ ok starting** / ▶ start | Marks the task *Doing* and switches off its panic mode. |
| **✅ ate. done.** | Completes the task (confetti, reward sound, wins counter). |
| **＋** or **N** | Quick add with one-tap deadline and danger chips. |
| **🎧 lock in** or **F** | Focus mode: one task, a sprint timer (5/15/25/45 min) and optional noise. |
| Panic bar | Appears when an unstarted deadline is ≤ 3 hrs away. **pause panic 10 min** gives you a break. |
| 🔊 button | Cycles sound between full, soft and off. |
| ⟳ button | Syncs with the sheet now (it also syncs automatically every 60 s). |
| **Esc** | Closes any pop-up. |

**Noise lab** (bottom of the page): play white, pink or brown noise with a volume slider. A warning appears above 70% volume. Stop it from anywhere using the chip in the bottom-left corner.

**🎯 Goldilocks finder:** set your device volume to where you normally keep it, then run the 2-minute test (tap or press space only on **X**). Repeat it on 2–3 different days; the result averages all your runs. Silence winning is a valid result.

Editing directly in the sheet works too: changes appear on the dashboard within a minute. Setting Status to **Done** in the sheet also stamps the Done On date automatically.

## 9. Updating the code later

1. Paste the new file contents over the old ones in Apps Script and save.
2. If you use the web-app link: choose **Deploy → Manage deployments → ✏️ Edit**, set **Version: New version**, then **Deploy**. Your URL stays the same.
3. If new permissions are needed, Google asks the next time you run something from the menu.

## 10. Optional: deploy with clasp

For developers who'd rather push from the repo than paste by hand:

```bash
npm install -g @google/clasp
clasp login
# Find the Script ID in Apps Script → ⚙️ Project Settings
cd apps-script
echo '{"scriptId":"YOUR_SCRIPT_ID","rootDir":"."}' > .clasp.json   # git-ignored
clasp push
```

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| "No Tasks tab found" | The tab must be named exactly `Tasks`. Or run **⚡ Danger Zone → 🛠 Set up / repair**. |
| Deadlines off by hours | The sheet's time zone (File → Settings) and the script's (⚙️ Project Settings) must both be yours. |
| A task doesn't appear | Every task needs text in column A (Task). |
| No ⚡ Danger Zone menu | Reload the sheet. If it's still missing, run `onOpen` once from the editor. |
| No sound | Tap **enter** on the welcome screen, check the 🔊 button isn't on 🔇, and check your device volume. |
| Alarms stop on my phone | Mobile browsers pause pages in the background. Use the Telegram alerts for that. |
| "Telegram rejected that token" | Copy the whole token from BotFather, including the part before the `:`. |
| "No message reached the bot yet" | Tap START in the bot chat first, then run Connect again. |
| Telegram is silent | Choose **🔔 Send a test Telegram alert**. Check the chat isn't muted. In Apps Script → ⏰ Triggers there should be exactly one `telegramTick` trigger. |
| Buttons in Telegram feel slow | Expected: they're processed on the next minute's check. |
| "Service invoked too many times" | A daily Apps Script quota was hit. It resets within 24 hours. Use `/quiet` or reduce the number of overdue tasks. |

## 12. Uninstall

1. Choose **⚡ Danger Zone → 🔌 Disconnect Telegram** and **🔕 Turn OFF email reminders**.
2. In Apps Script, check **⏰ Triggers** and delete anything left over.
3. To remove the web app, choose **Deploy → Manage deployments → Archive**.
4. Delete the bot with `/deletebot` in @BotFather if you no longer need it.
