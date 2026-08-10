$root = 'g:\01画布项目\Nomi-main\docs'
$files = Get-ChildItem -Path $root -Recurse -File -Filter *.md -ErrorAction SilentlyContinue
Write-Output ('总md文件数: ' + $files.Count)
Write-Output '---按顶层目录/类型分布---'
$groups = $files | Group-Object {
  $rel = $_.FullName.Substring($root.Length).TrimStart('\')
  if ($rel -notmatch '\\') { '根目录' }
  else { $rel.Split('\')[0] }
}
$groups | Sort-Object Count -Descending | ForEach-Object {
  Write-Output ($_.Name + ': ' + $_.Count)
}
Write-Output '---根目录编号文件---'
$files | Where-Object { $_.FullName -notmatch '\\' -or ($_.FullName -match '\\[^\\]+$' -and $_.DirectoryName -eq $root) } | ForEach-Object { Write-Output $_.Name }
