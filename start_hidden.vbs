Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\David\.gemini\antigravity\scratch\skipr"
WshShell.Run "node server.js", 0, False
