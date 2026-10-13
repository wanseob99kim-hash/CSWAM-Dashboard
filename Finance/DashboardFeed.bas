Attribute VB_Name = "DashboardFeed"
Option Explicit

' ============================================================
' CSWAM Finance Dashboard - monthly feeding
'
' Replaces Module2.RunMerge and Module1.RunUploadProject.
'  - Paths are relative to this workbook's folder (no per-user paths).
'  - FS: Material / Labor / Overhead / EBITDA read from the right P&L rows;
'        BS SUM rows matched by exact label (Current vs Non-current).
'  - Forecast: the file with the latest "N+M" version is used.
'  - Upload key is read from the CSWAM_DASH_SECRET environment variable
'    (prompted when missing) instead of being stored in the workbook.
'
' Macros (Alt+F8):
'   RunProjectUpdate   - Cost Analysis file(s) -> project.xlsx
'   RunDashboardMerge  - build dashboard_data.xlsx and upload it
' ============================================================

Private Const WORKER_URL As String = "https://tiny-dew-e513.leeway-id.workers.dev/"
Private Const SECRET_ENV As String = "CSWAM_DASH_SECRET"
Private Const OUTPUT_NAME As String = "dashboard_data.xlsx"
Private Const FS_HEADERS As String = "Month,CurrentAssets,TotalAssets,CurrentLiabilities,TotalLiabilities,Equity,Cash,TradeReceivables,Inventories,TradePayables,ShortTermDebt,LongTermDebt,Sales,COGS,OperatingProfit,SGAExpenses,NonOpIncome,NonOpExpense,NetIncome,MaterialCost,LaborCost,MfgOverhead,EBITDA"
Private Const FCST_RANGE As String = "A1:O33"
Private Const HEADER_SCAN_ROWS As Long = 15
Private Const HEADER_SCAN_COLS As Long = 40
Private Const MAX_SCAN_ROWS As Long = 5000

' ------------------------------------------------------------
' Entry points
' ------------------------------------------------------------
Public Sub RunDashboardMerge()
    Dim report As String
    On Error GoTo Fail
    report = MergeDashboardData(ThisWorkbook.Path)
    On Error GoTo 0

    Dim outPath As String: outPath = ThisWorkbook.Path & "\" & OUTPUT_NAME
    If MsgBox(OUTPUT_NAME & " created:" & vbCrLf & outPath & vbCrLf & vbCrLf & report & vbCrLf & vbCrLf & _
              "Upload to the dashboard now?", vbYesNo + vbQuestion, "Dashboard Merge") = vbYes Then
        UploadToWorker outPath, OUTPUT_NAME
    End If
    Exit Sub
Fail:
    MsgBox "Merge failed: " & Err.Description, vbCritical, "Dashboard Merge"
End Sub

Public Sub RunProjectUpdate()
    Dim srcFiles As Variant
    srcFiles = Application.GetOpenFilename("Excel Files (*.xlsx;*.xls),*.xlsx;*.xls", , _
                                           "Select Cost Analysis file(s)", , True)
    If Not IsArray(srcFiles) Then Exit Sub

    Dim masterPath As String: masterPath = ThisWorkbook.Path & "\project.xlsx"
    Dim report As String, i As Long
    Application.ScreenUpdating = False
    For i = LBound(srcFiles) To UBound(srcFiles)
        report = report & UpdateProjectMaster(CStr(srcFiles(i)), masterPath) & vbCrLf
    Next i
    Application.ScreenUpdating = True
    MsgBox report & vbCrLf & "Next: run RunDashboardMerge.", vbInformation, "Project Update"
End Sub

' Builds dashboard_data.xlsx in baseDir and returns a summary. No dialogs.
Public Function MergeDashboardData(ByVal baseDir As String) As String
    Dim outPath As String: outPath = baseDir & "\" & OUTPUT_NAME
    Dim finDir As String: finDir = ResolveDataDir(baseDir, "Financials")
    Dim fcstDir As String: fcstDir = ResolveDataDir(baseDir, "Forecast")
    Dim newWb As Workbook, report As String

    On Error GoTo Fail
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    Set newWb = Workbooks.Add
    Do While newWb.Sheets.Count > 1
        newWb.Sheets(newWb.Sheets.Count).Delete
    Loop
    newWb.Sheets(1).Name = "FS"
    newWb.Sheets.Add(After:=newWb.Sheets("FS")).Name = "Vendor"
    newWb.Sheets.Add(After:=newWb.Sheets("Vendor")).Name = "Project"
    newWb.Sheets.Add(After:=newWb.Sheets("Project")).Name = "Forecast"

    report = "FS: " & BuildFSSheet(newWb.Sheets("FS"), finDir) & vbCrLf
    report = report & "Vendor: " & CopyFirstSheet(baseDir & "\vendor.xlsx", newWb.Sheets("Vendor")) & vbCrLf
    report = report & "Project: " & CopyFirstSheet(baseDir & "\project.xlsx", newWb.Sheets("Project")) & vbCrLf
    report = report & "Forecast: " & BuildForecastSheet(newWb.Sheets("Forecast"), fcstDir)

    CloseIfOpen OUTPUT_NAME
    newWb.SaveAs Filename:=outPath, FileFormat:=xlOpenXMLWorkbook
    newWb.Close False
    Set newWb = Nothing

    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    MergeDashboardData = report
    Exit Function
Fail:
    ' Errors raised inside a handler go to the caller, so keep cleanup minimal
    Dim msg As String: msg = Err.Description
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    If Not newWb Is Nothing Then newWb.Close False
    Err.Raise vbObjectError + 513, "MergeDashboardData", msg
End Function

' ------------------------------------------------------------
' FS sheet (from Closing Packages)
' ------------------------------------------------------------
Private Function BuildFSSheet(destWs As Worksheet, ByVal finDir As String) As String
    Dim headers As Variant: headers = Split(FS_HEADERS, ",")
    Dim colCount As Long: colCount = UBound(headers) + 1
    destWs.Range("A1").Resize(1, colCount).Value = headers
    destWs.Columns(1).NumberFormat = "@"   ' keep "YYYY-MM" as text

    Dim files As Variant: files = ListXlsxSorted(finDir)
    If IsEmpty(files) Then
        BuildFSSheet = "no Closing Package in " & finDir
        Exit Function
    End If

    ' Files are processed oldest -> newest, so the newest package wins for each month
    Dim byMonth As Object: Set byMonth = CreateObject("Scripting.Dictionary")
    Dim skipped As String, i As Long
    For i = LBound(files) To UBound(files)
        If Not ParseClosingPkg(finDir, CStr(files(i)), byMonth) Then skipped = skipped & " [" & files(i) & "]"
    Next i
    If byMonth.Count = 0 Then
        BuildFSSheet = "no month parsed" & skipped
        Exit Function
    End If

    Dim months As Variant: months = SortStrings(byMonth.Keys)
    For i = 0 To UBound(months)
        destWs.Cells(i + 2, 1).Resize(1, colCount).Value = byMonth(months(i))
    Next i

    BuildFSSheet = byMonth.Count & " month(s), " & months(0) & " ~ " & months(UBound(months))
    If skipped <> "" Then BuildFSSheet = BuildFSSheet & " | skipped:" & skipped
End Function

' Adds one row per month with sales to byMonth. Returns False when the file cannot be used.
Private Function ParseClosingPkg(ByVal folder As String, ByVal fileName As String, byMonth As Object) As Boolean
    Dim yr As Long: yr = YearFromFileName(fileName)
    If yr = 0 Then Exit Function

    Dim wb As Workbook
    On Error Resume Next
    Set wb = Workbooks.Open(folder & fileName, ReadOnly:=True, UpdateLinks:=False)
    On Error GoTo 0
    If wb Is Nothing Then Exit Function

    Dim plWs As Worksheet, bsWs As Worksheet, ws As Worksheet
    For Each ws In wb.Worksheets
        If plWs Is Nothing And InStr(ws.Name, "1-4") > 0 Then Set plWs = ws
        If bsWs Is Nothing And InStr(ws.Name, "1-5") > 0 Then Set bsWs = ws
    Next ws
    If plWs Is Nothing Or bsWs Is Nothing Then
        wb.Close False
        Exit Function
    End If

    ' --- P&L rows: totals in column B, COGS components in column C
    Dim plLast As Long: plLast = LastUsedRow(plWs)
    Dim plJan As Long: plJan = FindJanColumn(plWs)
    Dim rSales As Long: rSales = FindLabelRow(plWs, 2, "Sales", plLast)
    Dim rCOGS As Long:  rCOGS = FindLabelRow(plWs, 2, "COGS", plLast)
    Dim rMat As Long:   rMat = FindLabelRow(plWs, 3, "Material", plLast)
    Dim rLab As Long:   rLab = FindLabelRow(plWs, 3, "Labor", plLast)
    Dim rOvh As Long:   rOvh = FindLabelRow(plWs, 3, "Overhead", plLast)
    Dim rSGA As Long:   rSGA = FindLabelRow(plWs, 2, "SG&A", plLast)
    Dim rOI As Long:    rOI = FindLabelRow(plWs, 2, "Operating Income", plLast)
    Dim rEBITDA As Long: rEBITDA = FindLabelRow(plWs, 2, "EBITDA", plLast)
    Dim rNOI As Long:   rNOI = FindLabelRow(plWs, 2, "Non-Operating Income", plLast)
    Dim rNOE As Long:   rNOE = FindLabelRow(plWs, 2, "Non-Operating Expense", plLast)
    Dim rNI As Long:    rNI = FindLabelRow(plWs, 2, "Net Income", plLast)
    If rSales = 0 Then
        wb.Close False
        Exit Function
    End If

    ' --- BS rows: "SUM" in column B + English label in column D, or GCoA code in column B
    Dim bsLast As Long: bsLast = LastUsedRow(bsWs)
    Dim bsJan As Long: bsJan = FindJanColumn(bsWs)
    Dim bCA As Long, bTA As Long, bCL As Long, bNCL As Long, bInv As Long
    Dim bCash As Long, bAR As Long, bAP As Long, bSTD As Long, bLTD As Long
    Dim r As Long, tag As String, code As String
    For r = 1 To bsLast
        code = CellText(bsWs, r, 2)
        If code = "SUM" Then
            tag = NormalizeBsLabel(CellText(bsWs, r, 4))
            If bCA = 0 And tag = "current assets" Then bCA = r
            If bTA = 0 And tag = "total assets" Then bTA = r
            If bCL = 0 And tag = "current liabilities" Then bCL = r
            If bNCL = 0 And (tag = "non-current liability" Or tag = "non-current liabilities") Then bNCL = r
            If bInv = 0 And tag = "inventories" Then bInv = r
        Else
            Select Case code
                Case "110100": If bCash = 0 Then bCash = r
                Case "110500": If bAR = 0 Then bAR = r
                Case "210200": If bAP = 0 Then bAP = r
                Case "210500": If bSTD = 0 Then bSTD = r
                Case "230300": If bLTD = 0 Then bLTD = r
            End Select
        End If
    Next r

    ' --- one row per month that has sales
    Dim mi As Long, sales As Double, curLiab As Double, totLiab As Double, totAssets As Double
    Dim monthKey As String
    For mi = 0 To 11
        sales = NumAt(plWs, rSales, plJan + mi)
        If Abs(sales) >= 1 Then
            curLiab = NumAt(bsWs, bCL, bsJan + mi)
            totLiab = curLiab + NumAt(bsWs, bNCL, bsJan + mi)
            totAssets = NumAt(bsWs, bTA, bsJan + mi)
            monthKey = yr & "-" & Format$(mi + 1, "00")
            byMonth(monthKey) = Array(monthKey, _
                NumAt(bsWs, bCA, bsJan + mi), totAssets, curLiab, totLiab, totAssets - totLiab, _
                NumAt(bsWs, bCash, bsJan + mi), NumAt(bsWs, bAR, bsJan + mi), NumAt(bsWs, bInv, bsJan + mi), _
                NumAt(bsWs, bAP, bsJan + mi), NumAt(bsWs, bSTD, bsJan + mi), NumAt(bsWs, bLTD, bsJan + mi), _
                sales, NumAt(plWs, rCOGS, plJan + mi), NumAt(plWs, rOI, plJan + mi), NumAt(plWs, rSGA, plJan + mi), _
                NumAt(plWs, rNOI, plJan + mi), NumAt(plWs, rNOE, plJan + mi), NumAt(plWs, rNI, plJan + mi), _
                NumAt(plWs, rMat, plJan + mi), NumAt(plWs, rLab, plJan + mi), NumAt(plWs, rOvh, plJan + mi), _
                NumAt(plWs, rEBITDA, plJan + mi))
        End If
    Next mi

    wb.Close False
    ParseClosingPkg = True
End Function

' "I. Current Assets" -> "current assets", "(2) Inventories" -> "inventories"
Private Function NormalizeBsLabel(ByVal s As String) As String
    Dim p As Long
    s = LCase$(Trim$(s))
    If Left$(s, 1) = "(" Then
        p = InStr(s, ") ")
        If p > 0 Then s = Mid$(s, p + 2)
    Else
        p = InStr(s, ". ")
        If p > 0 And p <= 6 Then s = Mid$(s, p + 2)
    End If
    NormalizeBsLabel = Trim$(s)
End Function

' ------------------------------------------------------------
' Forecast sheet (latest Rolling FCST)
' ------------------------------------------------------------
Private Function BuildForecastSheet(destWs As Worksheet, ByVal fcstDir As String) As String
    Dim files As Variant: files = ListXlsxSorted(fcstDir)
    If IsEmpty(files) Then
        destWs.Range("A1").Value = "No forecast file"
        BuildForecastSheet = "no file in " & fcstDir
        Exit Function
    End If

    ' Highest N in "FCST N+M" wins; names are sorted, so a later "_rev" file wins a tie
    Dim re As Object: Set re = CreateObject("VBScript.RegExp")
    re.Pattern = "FCST\s*(\d+)\+(\d+)"
    re.IgnoreCase = True
    Dim best As String, bestN As Long, n As Long, i As Long
    bestN = -1
    For i = LBound(files) To UBound(files)
        If re.Test(CStr(files(i))) Then
            n = CLng(re.Execute(CStr(files(i)))(0).SubMatches(0))
            If n >= bestN Then bestN = n: best = CStr(files(i))
        End If
    Next i
    If best = "" Then
        destWs.Range("A1").Value = "No 'FCST N+M' file"
        BuildForecastSheet = "no 'FCST N+M' file name in " & fcstDir
        Exit Function
    End If

    Dim wb As Workbook
    On Error Resume Next
    Set wb = Workbooks.Open(fcstDir & best, ReadOnly:=True, UpdateLinks:=False)
    On Error GoTo 0
    If wb Is Nothing Then
        BuildForecastSheet = "cannot open " & best
        Exit Function
    End If

    Dim src As Worksheet, ws As Worksheet
    For Each ws In wb.Worksheets
        If InStr(1, ws.Name, "P&L_Summary", vbTextCompare) > 0 Then Set src = ws: Exit For
    Next ws
    If src Is Nothing Then
        wb.Close False
        destWs.Range("A1").Value = "1.P&L_Summary sheet not found"
        BuildForecastSheet = "no P&L_Summary sheet in " & best
        Exit Function
    End If

    destWs.Range(FCST_RANGE).Value = src.Range(FCST_RANGE).Value
    wb.Close False
    BuildForecastSheet = best
End Function

' ------------------------------------------------------------
' Project master (from Cost Analysis PIVOT sheet)
' ------------------------------------------------------------
Private Function UpdateProjectMaster(ByVal srcPath As String, ByVal masterPath As String) As String
    Dim fileName As String: fileName = Mid$(srcPath, InStrRev(srcPath, "\") + 1)
    Dim monthKey As String: monthKey = MonthFromFileName(fileName)
    If monthKey = "" Then monthKey = InputBox("Month not found in: " & fileName & vbCrLf & "Enter YYYY-MM:", "Month")
    If Not monthKey Like "####-##" Then
        UpdateProjectMaster = fileName & ": skipped (no month)"
        Exit Function
    End If

    Dim srcWb As Workbook
    On Error Resume Next
    Set srcWb = Workbooks.Open(srcPath, ReadOnly:=True, UpdateLinks:=False)
    On Error GoTo 0
    If srcWb Is Nothing Then
        UpdateProjectMaster = fileName & ": cannot open"
        Exit Function
    End If

    Dim pivotWs As Worksheet
    On Error Resume Next
    Set pivotWs = srcWb.Sheets("PIVOT")
    On Error GoTo 0
    If pivotWs Is Nothing Then
        srcWb.Close False
        UpdateProjectMaster = fileName & ": no PIVOT sheet"
        Exit Function
    End If

    ' Pivot labels in Korean Excel: "Row Labels" / "Grand Total"
    Dim rowLabelsKo As String: rowLabelsKo = ChrW(&HD589) & " " & ChrW(&HB808) & ChrW(&HC774) & ChrW(&HBE14)
    Dim grandTotalKo As String: grandTotalKo = ChrW(&HCD1D) & ChrW(&HD569) & ChrW(&HACC4)

    Dim rowsOut As New Collection
    Dim lastRow As Long: lastRow = LastUsedRow(pivotWs)
    Dim customer As String, rawVal As String, label As String
    Dim r As Long, rev As Double, pl As Double, margin As Double
    For r = 1 To lastRow
        rawVal = CellText(pivotWs, r, 1, False)
        label = Trim$(rawVal)
        If label = "" Or InStr(label, "Margin Analysis") > 0 _
           Or label = "Row Labels" Or label = rowLabelsKo _
           Or label = "Grand Total" Or label = grandTotalKo Then GoTo NextRow

        If pivotWs.Cells(r, 1).IndentLevel = 0 And Left$(rawVal, 2) <> "  " Then
            customer = label
        ElseIf customer <> "" Then
            rev = Abs(NumAt(pivotWs, r, 3))
            pl = NumAt(pivotWs, r, 5)
            margin = 0
            If rev <> 0 Then margin = pl / rev
            rowsOut.Add Array(monthKey, customer, label, NumAt(pivotWs, r, 2), rev, _
                              Abs(NumAt(pivotWs, r, 4)), pl, margin)
        End If
NextRow:
    Next r
    srcWb.Close False

    ' Write to master: replace this month's rows
    Dim masterWb As Workbook
    Application.DisplayAlerts = False
    If Len(Dir(masterPath)) > 0 Then
        Set masterWb = Workbooks.Open(masterPath, UpdateLinks:=False)
    Else
        Set masterWb = Workbooks.Add
        masterWb.SaveAs masterPath, xlOpenXMLWorkbook
    End If
    Application.DisplayAlerts = True

    Dim ws As Worksheet: Set ws = masterWb.Worksheets(1)
    If CellText(ws, 1, 1) = "" Then
        ws.Range("A1").Resize(1, 8).Value = Array("Month", "Customer", "Project", "Qty", "Revenue", "Cost", "PL", "Margin")
    End If
    ws.Columns(1).NumberFormat = "@"

    Dim lr As Long: lr = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    For r = lr To 2 Step -1
        If CellText(ws, r, 1) = monthKey Then ws.Rows(r).Delete
    Next r
    lr = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1

    Dim item As Variant
    For Each item In rowsOut
        ws.Cells(lr, 1).Resize(1, 8).Value = item
        lr = lr + 1
    Next item
    masterWb.Save
    masterWb.Close False

    UpdateProjectMaster = fileName & ": " & monthKey & ", " & rowsOut.Count & " project(s)"
End Function

' ------------------------------------------------------------
' Upload
' ------------------------------------------------------------
Private Sub UploadToWorker(ByVal filePath As String, ByVal remoteName As String)
    Dim secret As String: secret = Environ$(SECRET_ENV)
    If secret = "" Then
        secret = InputBox("Upload key" & vbCrLf & "(set the " & SECRET_ENV & " environment variable to skip this prompt)", "Dashboard upload")
    End If
    If secret = "" Then
        MsgBox "Upload cancelled. " & remoteName & " was saved locally only.", vbExclamation
        Exit Sub
    End If

    Dim stream As Object, body As Variant
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 1
    stream.Open
    stream.LoadFromFile filePath
    body = stream.Read
    stream.Close

    Dim http As Object: Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    On Error GoTo NetFail
    http.Open "POST", WORKER_URL, False
    http.SetRequestHeader "x-secret", secret
    http.SetRequestHeader "x-filename", remoteName
    http.SetRequestHeader "Content-Type", "application/octet-stream"
    http.Send body
    On Error GoTo 0

    If http.Status = 200 Then
        MsgBox remoteName & " uploaded. The dashboard refreshes within 60 seconds.", vbInformation
    Else
        MsgBox "Upload failed (" & http.Status & ")" & vbCrLf & http.ResponseText, vbCritical
    End If
    Exit Sub
NetFail:
    MsgBox "Upload failed: " & Err.Description, vbCritical
End Sub

' ------------------------------------------------------------
' Helpers
' ------------------------------------------------------------
' First folder with .xlsx files: <base>\<name>\, <base>\<name>\<name>\,
' <base>\Raw data\<name>\ or <base>\Raw data\<name>\<name>\
Private Function ResolveDataDir(ByVal baseDir As String, ByVal folderName As String) As String
    Dim candidates As Variant, i As Long
    candidates = Array(baseDir & "\" & folderName & "\", _
                       baseDir & "\" & folderName & "\" & folderName & "\", _
                       baseDir & "\Raw data\" & folderName & "\", _
                       baseDir & "\Raw data\" & folderName & "\" & folderName & "\")
    For i = LBound(candidates) To UBound(candidates)
        If Len(Dir(candidates(i) & "*.xlsx")) > 0 Then
            ResolveDataDir = candidates(i)
            Exit Function
        End If
    Next i
    ResolveDataDir = candidates(0)
End Function

' Sorted .xlsx names in folder (Excel lock files excluded); Empty when none
Private Function ListXlsxSorted(ByVal folder As String) As Variant
    Dim names() As String, n As Long, f As String
    f = Dir(folder & "*.xlsx")
    Do While f <> ""
        If Left$(f, 2) <> "~$" Then
            ReDim Preserve names(0 To n)
            names(n) = f
            n = n + 1
        End If
        f = Dir()
    Loop
    If n = 0 Then
        ListXlsxSorted = Empty
    Else
        ListXlsxSorted = SortStrings(names)
    End If
End Function

Private Function SortStrings(ByVal arr As Variant) As Variant
    Dim i As Long, j As Long, tmp As Variant
    For i = LBound(arr) To UBound(arr) - 1
        For j = LBound(arr) To UBound(arr) - 1 - (i - LBound(arr))
            If StrComp(arr(j), arr(j + 1), vbTextCompare) > 0 Then
                tmp = arr(j): arr(j) = arr(j + 1): arr(j + 1) = tmp
            End If
        Next j
    Next i
    SortStrings = arr
End Function

Private Function CopyFirstSheet(ByVal srcPath As String, destWs As Worksheet) As String
    If Len(Dir(srcPath)) = 0 Then
        CopyFirstSheet = "MISSING " & srcPath
        Exit Function
    End If
    Dim wb As Workbook
    Set wb = Workbooks.Open(srcPath, ReadOnly:=True, UpdateLinks:=False)
    Dim used As Range: Set used = wb.Sheets(1).UsedRange
    Dim rowCount As Long: rowCount = used.Rows.Count
    destWs.Range("A1").Resize(rowCount, used.Columns.Count).Value = used.Value
    Set used = Nothing
    wb.Close False
    CopyFirstSheet = (rowCount - 1) & " row(s)"
End Function

Private Sub CloseIfOpen(ByVal bookName As String)
    Dim wb As Workbook
    For Each wb In Workbooks
        If LCase$(wb.Name) = LCase$(bookName) Then
            wb.Close False
            Exit Sub
        End If
    Next wb
End Sub

Private Function FindJanColumn(ws As Worksheet) As Long
    Dim r As Long, c As Long
    For r = 1 To HEADER_SCAN_ROWS
        For c = 1 To HEADER_SCAN_COLS
            If CellText(ws, r, c) = "Jan" Then
                FindJanColumn = c
                Exit Function
            End If
        Next c
    Next r
    FindJanColumn = 5   ' column E
End Function

' First row whose column `col` equals label (trimmed, case-insensitive); 0 when absent
Private Function FindLabelRow(ws As Worksheet, ByVal col As Long, ByVal label As String, ByVal lastRow As Long) As Long
    Dim r As Long
    For r = 1 To lastRow
        If StrComp(CellText(ws, r, col), label, vbTextCompare) = 0 Then
            FindLabelRow = r
            Exit Function
        End If
    Next r
End Function

Private Function LastUsedRow(ws As Worksheet) As Long
    LastUsedRow = ws.UsedRange.Row + ws.UsedRange.Rows.Count - 1
    If LastUsedRow > MAX_SCAN_ROWS Then LastUsedRow = MAX_SCAN_ROWS
End Function

' Cell value as text; "" for empty or error cells
Private Function CellText(ws As Worksheet, ByVal r As Long, ByVal c As Long, Optional ByVal trimmed As Boolean = True) As String
    Dim v As Variant: v = ws.Cells(r, c).Value
    If IsError(v) Or IsEmpty(v) Then Exit Function
    CellText = CStr(v)
    If trimmed Then CellText = Trim$(CellText)
End Function

' Numeric cell value; 0 for missing rows, text or error cells
Private Function NumAt(ws As Worksheet, ByVal r As Long, ByVal c As Long) As Double
    If r <= 0 Or c <= 0 Then Exit Function
    Dim v As Variant: v = ws.Cells(r, c).Value
    If IsError(v) Then Exit Function
    If IsNumeric(v) And Not IsEmpty(v) Then NumAt = CDbl(v)
End Function

Private Function YearFromFileName(ByVal fileName As String) As Long
    Dim m As String: m = MonthFromFileName(fileName)
    If m <> "" Then YearFromFileName = CLng(Left$(m, 4))
End Function

' "..._2026.08.xlsx" -> "2026-08"
Private Function MonthFromFileName(ByVal fileName As String) As String
    Dim re As Object: Set re = CreateObject("VBScript.RegExp")
    re.Pattern = "_(\d{4})\.(\d{2})\."
    If re.Test(fileName) Then
        With re.Execute(fileName)(0)
            MonthFromFileName = .SubMatches(0) & "-" & .SubMatches(1)
        End With
    End If
End Function
