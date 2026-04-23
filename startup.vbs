' 启动 Electron 桌面应用
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' 移除可能干扰的环境变量
WshShell.Environment("Process").Remove "ELECTRON_RUN_AS_NODE"

' 先构建，然后启动 Electron
WshShell.Run "npm run build", 0, True
WshShell.Run "npm run start", 1, False
