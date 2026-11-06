# Copy this repo's layouts and mods into the live Herdr folder
# (~/.config/herdr-app): the reverse of ./sync.ps1. Use it after a pull or
# on a new machine. Herdr picks the files up by itself.
#
#   ./restore.ps1
#
# Copies and overwrites the layouts and mods listed in sync.ps1, like a
# copy & paste: files that exist only in Herdr are left alone, never deleted.

& (Join-Path $PSScriptRoot "sync.ps1") -Restore
