# HashChat Complete - Design Guidelines

## Design Approach

**System-Based with Custom Aesthetic**: Building on the existing dark gradient aesthetic, implementing a modern messaging app design system inspired by Discord's information hierarchy + Telegram's message density + Linear's typography precision.

**Core Principle**: Maximize information density while maintaining visual clarity through strategic use of contrast, spacing, and hierarchy.

---

## Layout System

### Spacing Scale
Consistent Tailwind units: **2, 3, 4, 6, 8, 12, 16, 20** (as in p-2, gap-4, mt-8, etc.)
- Micro spacing (within components): 2-4
- Component spacing: 6-8
- Section spacing: 12-16
- Major divisions: 20

### Application Structure

**Three-Column Layout** (Desktop):
1. **Sidebar** (280px): Contacts/Groups list, search, user profile
2. **Main Chat** (flex-1, min 400px): Active conversation
3. **Info Panel** (320px, collapsible): Contact details, shared media, group members

**Two-Column Mobile** (< 1024px): Sidebar collapses, info panel becomes modal

---

## Typography

**Font Stack**: System fonts for performance
- Primary: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Monospace (hashes, code): `"SF Mono", Monaco, "Cascadia Code", monospace`

**Hierarchy**:
- Page titles: text-2xl font-bold (login screens)
- Section headers: text-lg font-semibold
- Contact names: text-base font-semibold
- Message content: text-sm (14px)
- Timestamps, metadata: text-xs (12px)
- Input placeholders: text-sm with reduced opacity

---

## Authentication Screens

### Login/Signup Layout
**Centered card approach** (max-w-md):
- Full viewport height with gradient background matching app aesthetic
- Card: rounded-xl with backdrop blur effect
- Logo/brand at top (80px height)
- Form fields with 4 spacing between
- Primary CTA button (full width, h-12)
- Social login buttons below (Google, GitHub, etc.) - grid-cols-2 on desktop
- Footer link to switch between login/signup

**Split Screen Alternative** (Desktop only):
- Left 40%: Hero visual/branding with gradient overlay
- Right 60%: Authentication form (centered, max-w-md)

---

## Main Chat Interface

### Sidebar Components

**User Profile Section** (top):
- Avatar (48x48 rounded-lg) + name + status indicator
- Dropdown menu trigger for settings/logout

**Search Bar**: 
- Full width, h-10, rounded-lg
- Icon prefix (search icon, 16px)
- Filter chips below (All, Unread, Groups, Pinned)

**Contact/Group List**:
- Each item: h-16, flex layout
- Avatar (40x40) + name/last message stack + timestamp/unread badge
- Active state: subtle left border (3px) + background tint
- Hover state: background elevation
- Unread badge: circle (20px) with count, positioned top-right of avatar area

### Chat Area

**Header** (h-16):
- Avatar + name + online status on left
- Action buttons on right (video call, voice call, info panel toggle, settings)
- Space-between flex layout

**Message Container**:
- Padding: px-6 py-4
- Max width for bubbles: 65% of container
- Sent messages: ml-auto (right-aligned)
- Received: mr-auto (left-aligned)

**Message Bubble Structure**:
- Padding: px-4 py-2.5
- Border-radius: 12px (sent: bottom-right reduced to 2px, received: bottom-left reduced to 2px)
- Sequential messages from same sender: reduced top margin (1 instead of 3)
- Timestamp: text-xs, mt-1, opacity-70

**Special Message Types**:
- **Replied messages**: Thin left border + quoted text (opacity-60, text-xs) above main message
- **Edited messages**: "(edited)" tag in timestamp, text-xs italic
- **Reactions**: Flex row below bubble (gap-1), each reaction as pill (rounded-full, text-sm, px-2)
- **File attachments**: Card within bubble (rounded-lg, p-3, with icon + filename + size)
- **Images**: Full width of bubble, rounded corners, max-h-80, click to expand

**Message Actions** (on hover):
- Floating action bar appears to the side of bubble
- Icons: reply, react, forward, delete (16px size, gap-2)

**Typing Indicator**: 
- At bottom of chat, small animated dots (8px each)
- Text: "{User} is typing..." text-xs

**Input Area** (h-16):
- Flex layout: attachment button (w-10) + input (flex-1) + emoji button (w-10) + send button (w-10)
- Input: rounded-full, px-4
- Reply preview above input (dismissible, h-12)

---

## Group Chat Enhancements

**Group Header**:
- Group avatar (generated from first letters or uploaded image)
- Member count + last active indicator
- Group name larger (text-lg)

**Info Panel Content** (when opened):
- Group details section (name, description, created date)
- Members list (avatars + names, scrollable, max 8 visible then "...X more")
- Shared media grid (3 columns, square thumbnails)
- Group settings button at bottom

---

## Component Specifications

### Modals
- Backdrop: blur with opacity-50
- Panel: max-w-2xl for content modals, max-w-md for simple dialogs
- Padding: p-6
- Header: pb-4 with border-b
- Footer: pt-4 with action buttons (right-aligned)

### Buttons
- Primary: h-10, px-6, rounded-lg, font-medium
- Secondary: same height, border variant
- Icon-only: w-10 h-10, rounded-lg
- Disabled state: opacity-50, cursor-not-allowed

### Form Inputs
- Height: h-10 for single-line, h-24 for textarea
- Padding: px-4 py-2
- Border-radius: 8px
- Focus state: ring (2px width)

### Badges/Pills
- Height: h-6, px-2, rounded-full
- Font: text-xs font-medium
- Use cases: unread count, online status, member roles

---

## Feature-Specific Layouts

**Video Call Screen**:
- Full viewport takeover
- Main video: 100% width/height
- Thumbnail videos: fixed bottom-right, 160x120, gap-2
- Controls overlay: bottom-center (absolute positioning)
- Participant grid (multiple callers): CSS grid, auto-fit with min 240px

**Search/Filter Screen**:
- Search results list with highlighted matching text
- Filters sidebar (left): checkboxes for date range, message type, sender
- Each result: message preview + context (3 lines before/after)

**Settings Panel**:
- Tab navigation (left sidebar, 200px wide)
- Content area (flex-1): each section with heading + description + controls
- Sections: Account, Privacy, Notifications, Appearance, Data

**Profile View**:
- Header with large avatar (120x120) + name + status
- Stats row (messages sent, files shared, etc.) - grid-cols-3
- About section with bio
- Media gallery below

---

## Responsive Behavior

**Breakpoints**:
- Mobile: < 768px (single column, bottom nav)
- Tablet: 768-1024px (two column, sidebar collapsible)
- Desktop: > 1024px (three column layout)

**Mobile Adjustments**:
- Bottom navigation (5 icons: Chats, Groups, Contacts, Calls, Settings)
- Full-width chat screens
- Swipe gestures for sidebar/info panel
- Message bubbles: max-width 85%

---

## Animations

**Minimal & Purposeful**:
- Message send: subtle scale-in (0.95 → 1.0, 150ms)
- New message arrival: slide-in from bottom (200ms)
- Modal open/close: fade + scale (250ms)
- Hover states: 150ms transition for background/border
- Typing indicator: gentle pulse animation (1s loop)

**No animations**: Page transitions, scroll effects, decorative flourishes

---

## Accessibility

- Focus indicators: 2px ring on all interactive elements
- ARIA labels on icon-only buttons
- Keyboard navigation: Tab through contacts, arrow keys in message list
- Color contrast: Minimum 4.5:1 for text
- Screen reader announcements for new messages

---

This design system prioritizes clarity, speed, and information density while maintaining the modern gradient aesthetic of your existing HashChat foundation.