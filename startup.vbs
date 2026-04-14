Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Environment("Process").Remove "ELECTRON_RUN_AS_NODE"
WshShell.Run """node"" ""node_modules\vite\bin\vite.js""", 0, False
