---
name: word-count
description: Count words, characters, and lines in a piece of text accurately instead of estimating.
---

# Word count skill

When the user asks how many words, characters, or lines a piece of text has,
do NOT estimate. Count precisely:

1. Words: split the text on whitespace and count the resulting items.
2. Characters: count every character including spaces (state whether spaces
   are included in your answer).
3. Lines: count newline-separated lines, ignoring a trailing empty line.

Show the numbers in a short table and offer to break the count down per
paragraph if the text has more than one.
