# Methodology

How Rewindly computes the statistics that need more than counting, and the
research they are based on. Everything below runs entirely in your browser on
your own data.

## Conversation sessions

Chat messages don't form one continuous conversation — they cluster into
bursts separated by long silences. Following Halfaker et al., _User Session
Identification Based on Strong Regularities in Inter-activity Time_ (WWW
2015, [arXiv:1411.2878](https://arxiv.org/abs/1411.2878)), the distribution
of **log** inter-message gaps is bimodal: a within-conversation component and
a between-conversation component. For every chat we fit a two-component
Gaussian mixture (deterministic EM) on its log gaps and place the session
boundary at the valley between the components — a per-chat threshold learned
from that chat's own rhythm, rather than an arbitrary cutoff.

Two corrections proved necessary on real chats. First, dyadic chat gaps have
_three_ modes — typing bursts (seconds), within-conversation pauses
(minutes), and between-conversation silences (hours+) — and the dominant
burst mode hijacks one mixture component, so gaps under 2 minutes are
excluded from the fit. Second, a sensitivity sweep showed the derived
metrics (initiation share, ignored attempts) only stabilize once boundaries
reach several hours, so the threshold is clamped to [4 hours, 3 days], with
4 hours as the fallback when a chat has too few slow gaps for a stable fit.
(Halfaker's ~1-hour rule of thumb was derived for solo activity sessions,
not two-person conversations.)

Sessions make the remaining definitions honest:

## Reply times

A **reply** is a message that answers the other side _within the same
session_. Median (and only median) is reported: reply-time distributions are
heavy-tailed — in Kooti et al.'s study of 16B emails (_Evolution of
Conversations in the Age of Email Overload_, WWW 2015) the modal reply was
two minutes while means were dragged far higher by tails — so a mean would
describe almost nobody's actual behavior. Session segmentation replaces the
usual "ignore gaps over N hours" hack: an overnight silence is a session
boundary, not a slow reply. On WhatsApp, exports carry minute-granularity
timestamps, so sub-minute replies are indistinguishable — medians at that
resolution display as "≤1m" rather than pretending to second precision.

## Conversation initiations

Whoever sends the first message of a session **initiated** that
conversation. Reported as your share of session openers across direct chats.
The framing of session-opening messages as the unit of responsiveness
follows Avrahami & Hudson, _Responsiveness in Instant Messaging_ (CHI 2006,
[PDF](https://interruptions.net/literature/Avrahami-CHI06-p731-avrahami.pdf)),
who showed metadata alone predicts whether such messages get answered.

## Ghosting

A conversation attempt is **ignored** when a session is entirely one-sided —
one side spoke, the other never joined — _and_ the silent side didn't even
open the following session (so a slow answer that arrives days later, as a
new conversation, still counts as engagement, and a mutually dormant chat
counts for nobody). The final session of a chat only counts once the silence
after it exceeds the chat's own session threshold. A chat appears in the
ghosting lists only with **at least two** ignored attempts — one unanswered
message is life, a pattern is a pattern. Conversation-closing messages
("good night") don't produce false positives because closings sit inside
sessions whose other messages both sides wrote — a distinction grounded in
conversation-analysis work on closings (Schegloff & Sacks, _Opening up
Closings_, Semiotica 1973).

## Texting style (bursts)

Message counts are style-biased: one person sends a paragraph, another
splits the same thought into five bubbles. A **burst** (turn) is a run of
consecutive messages by the same sender within one conversation session.
Messages-per-burst measures the splitting habit; characters-per-message and
total words measure actual writing volume. The volume slide shows words
alongside message counts for the same reason. DMs only.

## Timezone handling

Telegram supplies true epoch timestamps, bucketed in your browser's IANA
timezone. WhatsApp exports carry wall-clock times with no zone; they are
treated as UTC so day/hour bucketing reproduces the wall clock you actually
experienced.
