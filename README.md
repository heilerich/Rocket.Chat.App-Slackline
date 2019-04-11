# Slackline
Slackline is a Rocket.Chat App that allows users to receive private messages from a connected
slack workspace (the RC built-in slackbot does not have access to direct messages and private
groups) and also import their private message history.

To use this app the Rocket.Chat administrator must (I) must install this app in the RC instance,
(II) create a Slack app in their workspace and (III) enter the Slack app API keys in the settings
for this app.

## 1. Setup Slack Workspace App
1. Goto [Create Slack App](https://api.slack.com/apps?new_app=1)
2. Enter a name and select your workspace
3. Click `OAuth & Permissions` in the Sidebar, enable the following scopes `users:read`, `groups:history`, 
   `groups.write`, `groups.read`, `mpim:history`, `mpim:write`, `mpim:read` , `im:history`, `im:write` and `im:read` and save.
4. Click `Add new redirect URL`. Enter the url for the `oauth` endpoint from 
   the Slackline settings page in your Rocket.Chat instance, click add and save.
5. Click `Event Subscriptions` the Sidebar and enable Events
6. Enter the url for the `slackevent` endpoint from the Slackline settings page in 
   your Rocket.Chat instance as request URL. 
7. Subscribe to the `message.groups`, `message.im` and `message.mpim` events.
8. Click `OAuth & Permissions` in the Sidebar. Click install app to workspace.

## 2. Usage
These instructions are for individual users of the RC instance:

1. To use the app enter `/slackline login` anywhere.
2. Click the link, login to slack
3. Go to any private channel of which you want to import the message history and
 do `/slackline import`. This can take a few seconds, so don't worry if nothing 
 happens at first.
4. Enter `/slackline enable` to receive future messages from any private group,
 that you are part of, or from direct message conversation. This works only slack to RC, not
 the other way round.

**Caution** Due to API restrictions the app cannot check if messages have already been
 imported. So before importing any private conversations, check that messages haven't
 been imported already (by somebody else in the conversation) or you will have a lot of
 duplicates. I am aware of this issue, but I can't fix it until the Rocket.Chat developers
 implement the according functions in the Rocket.Chat App Engine (which is still in a beta
 stage).
