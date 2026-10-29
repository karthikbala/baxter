# Meeting demonstration

## Before the meeting

1. Open `http://localhost:5180`, enter as Alex, and open Demo studio.
2. Verify the application, worker heartbeat, and OpenAI configuration. Reset the scenario before rehearsal; this preserves enrolled device credentials.
3. For a physical phone, make this local application available over **trusted HTTPS**, or deploy it on the Ubuntu server. A laptop LAN HTTP address cannot provide the complete PWA microphone/push experience. The phone’s `localhost` is the phone itself.
4. Sign in as the case owner on the phone. Open Device & settings, enroll notifications, and send a connection test. Check the device and delivery log separately.
5. On iPhone: add to Home Screen and launch the installed app. On Android: Chrome PWA works with system notification sound; the Android APK supports the custom critical tone after Firebase is configured.
6. Check device volume, notification permission, the Android critical channel, and Do Not Disturb settings. Foreground audio must be enabled by a tap. A browser PWA cannot select custom background music.

## Five-minute core story

**0:00 — See the operating picture.** Show the overview. Every displayed total comes from the active PostgreSQL seed. Show one shipment’s original baseline and separate port, delivery and usable-receipt estimates.

**0:45 — Create the intervention moment.** In Demo studio, choose “Trigger in 10 seconds” and lock the connected phone. S01 moves the featured receipt from D+4 to D+9. The response engine records the source revision, calculates impact, opens a critical stock case, and queues push. Once triggered, “Send critical alert again” repeats the push without duplicating the case.

**1:15 — Explain why this matters.** Tap the push. The case shows 6,000 starting units, demand of 1,000/day, 3,000 unmet units on D+6–8, and €60,000 in linked customer orders exposed. Exposure is not a realised loss.

**2:00 — Ask for help.** Tap the assistant mic, say “Explain the stock gap and compare the transfer from Utrecht,” tap again to finish, review the transcript, and send. Alternatively type it. Ask “Draft a follow-up.” Open the returned preview and approve it. The simulated outbox and response deadline appear in the case record.

**3:00 — Make a reviewed decision.** Select “Review transfer.” Utrecht has 8,000 units, 2,000 committed, and a 3,000-unit protection requirement; 3,000 units remain available. The proposed transfer arrives D+5 for €1,200. Approval reserves stock and creates a plan. The case stays open pending receipt.

**4:00 — Prove the outcome.** Back in Demo studio, run S09. Synthetic receipt evidence confirms arrival of the transfer. The stock-risk case closes and exposure falls to zero. The ocean shipment remains in transit and late.

## Additional chapters

| Scenario | What to show                                                            | Preconditions                                                                                          |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| S02      | Missing commercial declaration, unknown customs start, broker follow-up | Fresh or active run                                                                                    |
| S03      | Calendar-day charge tiers and container count                           | At D+3: two containers × (€100 + €100 + €150) = €700; later clocks produce the larger current estimate |
| S04      | Unanswered request becomes an escalation                                | Approve a follow-up on the selected case first                                                         |
| S05      | Two trips serve one €60,000 customer line                               | Exposed value counted once in the shared-order case                                                    |
| S06      | Ambiguous housebill and cancelled ETA revision                          | Review the candidate shipment in Data quality                                                          |
| S07      | Supplier interruption through the multi-level BOM                       | Saved hypothetical analysis; no operational mutation                                                   |
| S08      | Hypothetical tariff applied to declared shipment value                  | Illustrative rate, not live tariff advice                                                              |
| S09      | Verified transfer receipt resolves only the stock risk                  | S01 and approved transfer                                                                              |

“Simulate partner reply” records response evidence but does not invent clearance or receipt. “Advance 2 hours” moves business time so the worker can fire due follow-ups. Push expiry still uses real wall-clock time. Scenarios S02–S09 execute once per run; reset permits replay.

## Delivery log interpretation

- **Queued:** persisted in the database/outbox.
- **No device:** the owner has no active enrollment. Connect the phone and repeat the critical push.
- **Provider accepted:** Web Push/FCM accepted the request. It does not prove display.
- **Received / displayed / opened:** separate client reports where available.
- **Acknowledged:** the user accepted the case; the risk still needs resolution.
- **Failed:** inspect the provider error and channel configuration. Expired credentials are deactivated.

External partner messages, customs evidence and stock execution are deliberately simulated. The demonstration should never be described as connected to Baxter’s live ERP or carriers.
