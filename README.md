# stonepheus

Slack bot that handles ticketing in the [#ask-the-stonemasons channel](https://hackclub.slack.com/archives/C09GSTH65B7) on the [Hack Club Slack](https://hackclub.com/slack). Built for the [Siege](https://siege.hackclub.com) YSWS (in both senses of "built for" ;-)).

## What it does

Head over to [#ask-the-stonemasons](https://hackclub.slack.com/archives/C09GSTH65B7) and send a message to open a ticket. This will forward the message into a stonemason-only backend channel, where stonemasons can reply in the thread. They can choose to answer anonymously or to share their name. You can also reply in the the thread for stonemasons to see in the backend. It's basically a two-way bridge!

## Setup instructions

1. Install [Bun](https://bun.com) on your device.
2. Copy the `.env.example` file as `.env.local` and edit the values as necessary.
3. Run `bun prod` to start the server.

## Technical details

Slack bots, unlike Discord bots, use webhooks instead of WebSocket connections by default. (Both can be configured to use the other though, but Discord only supports message events over WebSocket AFAIK.) So there are three endpoints:

- `/slack/events-endpoint` which handles `message` events
- `/slack/interactivity-endpoint` which handles button clicks ("close ticket" button)
- `/slack/command/{name}` which handles slash commands (for stonemasons to choose anonymous or not)

The webhook is hosted on [Nest](https://hackclub.app) at https://stonepheus.davidwhy.hackclub.app (there is no home page though so it would just be 404 if you tried to open that).
