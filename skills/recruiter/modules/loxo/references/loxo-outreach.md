# Loxo Outreach Reference

This reference covers Loxo's Outreach collection gathered on 2026-04-21.

## Collection

- Current collection used by Opencode subagent: `https://help.loxo.co/en/collections/8306153-outreach`
- User-provided older/alternate collection URL: `https://help.loxo.co/en/collections/314867-outreach`

The Opencode subagent returned a compiled document for 16 Outreach articles.

## Confirmed 16-Article Inventory

Firecrawl crawl inventory confirmed these 16 articles on 2026-04-21:

1. Proven Practice - Email Deliverability: `http://help.loxo.co/en/articles/8900738-proven-practice-email-deliverability`
2. Outreach Campaign Proven Practices: `http://help.loxo.co/en/articles/3742176-outreach-campaign-proven-practices`
3. Custom Personalization in Outreach Campaigns: `http://help.loxo.co/en/articles/9888523-custom-personalization-in-outreach-campaigns`
4. Understand Outreach Campaign Results: `http://help.loxo.co/en/articles/3742203-understand-outreach-campaign-results`
5. Outreach Campaign Questions: `http://help.loxo.co/en/articles/8899549-outreach-campaign-questions`
6. A/B Testing in Outreach: `http://help.loxo.co/en/articles/4324625-a-b-testing-in-outreach`
7. Edit Outreach Campaigns: `http://help.loxo.co/en/articles/8059194-edit-outreach-campaigns`
8. Schedule Send for Emails: `http://help.loxo.co/en/articles/5139037-schedule-send-for-emails`
9. Email and SMS Merge Tags: `http://help.loxo.co/en/articles/889592-email-and-sms-merge-tags`
10. Add People to an Outreach Campaign: `http://help.loxo.co/en/articles/8250960-add-people-to-an-outreach-campaign`
11. Loxo Mobile App for iOS: `http://help.loxo.co/en/articles/8571723-loxo-mobile-app-for-ios`
12. Phone and Calling Questions: `http://help.loxo.co/en/articles/446977-phone-and-calling-questions`
13. Send a Multi-Recipient Email or Text: `http://help.loxo.co/en/articles/447028-send-a-multi-recipient-email-or-text`
14. Make Calls and Build Your Call Queue: `http://help.loxo.co/en/articles/446967-make-calls-and-build-your-call-queue`
15. Sending SMS/Text Messages Through Loxo: `http://help.loxo.co/en/articles/1238771-sending-sms-text-messages-through-loxo`
16. Set Your Email Preferences: `http://help.loxo.co/en/articles/10136132-set-your-email-preferences`

Firecrawl cached 15 of these 16 article bodies locally before credits ran out. The Custom Personalization article body was verified directly from the official Help Center.

## Deliverability

Key operating rules:

- Set up SPF, DKIM, and DMARC for the sending domain.
- Use deliverability tools such as MXToolBox or EasyDMARC to check DNS records.
- Warm up new domains slowly.
- Start very low on new domains, such as 3-5 emails per day.
- Increase daily sending volume cautiously, no more than roughly 10 percent per day from gathered notes.
- Avoid sudden volume spikes.
- Keep spam complaints extremely low; gathered notes referenced Gmail's 0.30 percent threshold.
- Use unsubscribe links where required.
- Avoid spammy phrasing and excessive links/images.

## Campaign Setup

Before adding people:

1. Rename the campaign clearly.
2. Customize every template stage.
3. Replace bracketed/all-caps placeholders.
4. Confirm stage types and delays.
5. Confirm operating hours.
6. Confirm whether campaign is shared with the team.
7. Confirm email and phone priority/order.

Important: gathered notes indicate some campaign setup changes must happen before prospects are added.

Relevant confirmed articles:

- Edit Outreach Campaigns
- Add People to an Outreach Campaign
- Schedule Send for Emails
- Email and SMS Merge Tags
- Set Your Email Preferences

## Personalization

Personalize at the individual prospect level when possible.

Known routes:

- Loxo Chrome Extension: add to campaign and personalize message before adding.
- Person profile: Loxo Outreach section, add campaign, personalize stage content.

Official Custom Personalization article notes:

- Finalize the campaign before customizing and adding prospects.
- You can personalize campaigns already attached to a Job Stage or created with OutreachGPT.
- If auto-add campaign is linked to a job stage, the prospect is automatically placed into that Job Stage.
- Progression Triggers can automatically move the candidate as outreach is sent.
- In Chrome Extension, open the person's external profile, open the extension, choose `+Add to`, then `Add to campaign`.
- Select/search campaign, edit the stage copy, then add to campaign or use the clock to schedule start.
- Personalized stages show a `Modified` badge.
- Personalization applies only to that recipient while the person remains listed under the original campaign for analytics.
- Do not personalize A/B variant stages through Chrome Extension or profile; the article warns this impacts A/B testing.

## Results And Status

Track:

- Active
- Bounced
- Spam
- Complete
- Paused
- Pending
- Open
- Click
- Reply
- Downloaded

Operational cautions:

- Reply tracking requires correct email sync.
- Broken two-way sync must be fixed from email settings.
- Email provider open tracking can be unreliable.
- If the prospect replies from a different email than the tracked one, automation may not stop.
- Messages over daily limits can fail and may not retry automatically.

## Retry, Reschedule, Cancel

Known patterns:

- Update missing or invalid email/phone first.
- Retry failed stages after correcting contact data.
- Use Email Log for scheduled or failed message handling.
- Cancel scheduled messages from the log when available.

## A/B Testing

Use for subject/body testing in campaigns.

Known pattern:

1. Open campaign.
2. Use the plus/add option on an email stage.
3. Add an A/B test variant.
4. Save the alternate message.

Variants are randomized across prospects. Use enough volume before drawing conclusions.

## Attachments And Formatting

Prior notes captured:

- Attachments may have small size limits.
- Larger files should be inserted/shared another way.
- HTML may be supported but is not preferred unless needed.
- Campaign font sizes may be pixel-based.

Verify current limits before sending attachment-heavy campaigns.

## Campaign Behavior

Important gathered notes:

- Campaigns normally pause/stop on direct email replies.
- Calendly/link clicks or external bookings may not stop a campaign by themselves.
- Adding a stage to a finished campaign may not reactivate old prospects.
- Use a new campaign for secondary sequences when needed.
- Delays may be calendar-day based rather than business-day based; verify if timing matters.

## Calling, SMS, And Multi-Recipient Messaging

Confirmed Outreach articles cover:

- phone/calling questions
- call queue building
- sending SMS/texts through Loxo
- multi-recipient email or text
- mobile app behavior

Use these lanes only after checking whether Ja wants email, phone, SMS, or LinkedIn. Do not imply a message was sent unless the user explicitly authorizes it.

## Ja Usage

For candidate marketing:

- Keep the first email short.
- Put credibility in the first two lines.
- Use candidate evidence only from resume/transcript/notes.
- Keep CTA low-friction.
- Tag campaign contacts by candidate and target account.

Example tag set:

- `Synthetic Candidate Campaign`
- `Target Account`
- `Quality Hiring`
- `MPC`

Do not send from Loxo until Ja has reviewed final copy and target list.
