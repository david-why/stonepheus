// slack block kit types (partial ofc)

// Composition Objects

interface SlackTextObjectPlainText {
  type: 'plain_text'
  text: string
  emoji?: boolean
}

interface SlackTextObjectMrkdwn {
  type: 'mrkdwn'
  text: string
  verbatim?: boolean
}

type SlackTextObject = SlackTextObjectPlainText | SlackTextObjectMrkdwn

// Block Kit Elements

interface SlackButtonElement {
  type: 'button'
  text: SlackTextObject & { type: 'plain_text' }
  action_id?: string
  url?: string
  value?: string
  style?: 'primary' | 'danger'
  confirm?: unknown
  accessibility_label?: string
}

interface SlackImageElement {
  type: 'image'
  alt_text: string
  image_url: string
  // TODO: support slack_file
}

type SlackBlockInteractiveElement = SlackButtonElement

// Blocks

interface SlackContextBlock {
  type: 'context'
  elements: (SlackImageElement | SlackTextObject)[]
  block_id?: string
}

interface SlackRichTextBlock {
  type: 'rich_text'
  elements: SlackRichTextObject[]
  block_id?: string
}

interface SlackRichTextSection {
  type: 'rich_text_section'
  elements: SlackRichTextElement[]
}

type SlackRichTextObject = SlackRichTextSection

interface SlackRichTextTextElement {
  type: 'text'
  text: string
  style?: { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean }
}

interface SlackRichTextDateElement {
  type: 'date'
  timestamp: number
  format: string
  url?: string
  fallback?: string
}

interface SlackRichTextLinkElement {
  type: 'link'
  url: string
  text?: string
  unsafe?: boolean
  style?: { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean }
}

interface SlackRichTextUserElement {
  type: 'user'
  user_id: string
  style?: {
    bold?: boolean
    italic?: boolean
    strike?: boolean
    highlight?: boolean
    client_highlight?: boolean
    unlink?: boolean
  }
}

type SlackRichTextElement =
  | SlackRichTextTextElement
  | SlackRichTextDateElement
  | SlackRichTextLinkElement
  | SlackRichTextUserElement

interface SlackActionsBlock {
  type: 'actions'
  elements: SlackBlockInteractiveElement[]
}

interface SlackMarkdownBlock {
  type: 'markdown'
  text: string
  block_id?: string
}

interface SlackDividerBlock {
  type: 'divider'
  block_id?: string
}

type SlackBlock =
  | SlackContextBlock
  | SlackRichTextBlock
  | SlackActionsBlock
  | SlackMarkdownBlock
  | SlackDividerBlock

// slack events api events

interface SlackAppMentionEvent {
  type: 'app_mention'
  user: string
  thread_ts?: string
  ts: string
  client_msg_id: string
  text: string
  team: string
  blocks: unknown[]
  channel: string
  event_ts: string
}

interface SlackMessageEvent {
  type: 'message'
  subtype?: string
  hidden?: boolean
  user: string
  ts: string
  bot_id?: string
  app_id?: string
  text: string
  thread_ts: string
  channel: string
  app_id?: string
  blocks?: SlackBlock[]
  files?: SlackFileObject[]
  // ...
}

interface SlackReactionAddedEvent {
  type: 'reaction_added'
  user: string
  reaction: string
  item:
    | {
        type: 'message'
        channel: string
        ts: string
        thread_ts?: string
      }
    | { type: 'file' }
    | { type: 'file_comment' }
  item_user: string
  event_ts: string
}

type SlackEvent =
  | SlackAppMentionEvent
  | SlackMessageEvent
  | SlackReactionAddedEvent

// request bodies sent by slack to our endpoint

interface SlackBaseRequest {
  token: string
}

interface SlackUrlVerificationRequest extends SlackBaseRequest {
  type: 'url_verification'
  challenge: string
}

interface SlackEventCallbackRequest extends SlackBaseRequest {
  type: 'event_callback'
  team_id: string
  api_app_id: string
  event: SlackEvent
  event_id: string
  event_time: number
}

type SlackRequest = SlackUrlVerificationRequest | SlackEventCallbackRequest

// slack interactivity events

interface SlackBlockActionsInteraction {
  type: 'block_actions'
  user: {
    id: string
    // ...
  }
  channel: {
    id: string
    // ...
  }
  message: {
    user: string
    ts: string
    thread_ts?: string
    text: string
    // ...
  }
  response_url: stirng
  actions: {
    action_id: string
    value: string
    // ...
  }[]
  // ...
}

type SlackInteraction = SlackBlockActionsInteraction

// slack slash commands

interface SlackSlashCommandRequest {
  token: string
  team_id: string
  team_domain: string
  channel_id: string
  channel_name: string
  user_id: string
  user_name: string
  command: string
  text: string
  api_app_id: string
  is_enterprise_install: 'true' | 'false'
  response_url: string
  trigger_id: string
}

// general slack objects

interface SlackFileObject {
  id: string
  name: string
  title: string
  user: string
  url_private: string
  url_private_download: string
  permalink: string
  // ...
}

interface SlackResponseUrlPayload {
  text?: string
  response_type?: 'in_channel'
  replace_original?: 'true' | 'false'
  delete_original?: 'true' | 'false'
  thread_ts?: string
  blocks?: SlackBlock[]
  mrkdwn?: 'true' | 'false'
}
