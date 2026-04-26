# Repair Notes - API Function Restoration

## Problem
searchYouTubeAPI, searchNaverAPI, searchInstagramAPI are empty stubs returning [].

## Solution
Restore full implementations from jarvis-brain-openai.ts.bak lines 1129-1211.

## Key interfaces to restore:
- NaverSearchItem (with creatorName, blogId, guessedEmail, neighborCount, etc.)
- YouTubeChannel (with channelId, name, subscribers, email, instagram, etc.)
- InstagramAccount (with username, followers, bio, email, fullName, etc.)
