## Setup Slack Workspace App
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
