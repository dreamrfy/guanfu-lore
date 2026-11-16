# 观测环境（source 这个文件，避免每次手打长路径出错）
export MSYS_NO_PATHCONV=1
export ADB="E:/VBcoding/biyaaozhicheng/dev/android-sdk/platform-tools/adb.exe"
export PHONE="8BF4C20819011732"
export OBS="E:/VBcoding/bijiapp/ops/观测"

# 抓屏 + 控件树 + 控件表三件套：cap <名称>
cap() {
  "$ADB" -s "$PHONE" exec-out screencap -p > "$1.png"
  "$ADB" -s "$PHONE" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  "$ADB" -s "$PHONE" exec-out cat /sdcard/ui.xml > "$1.xml"
  python -I -X utf8 "$OBS/_tools/dump_table.py" "$1.xml" > "$1.table.txt"
}
tap() { "$ADB" -s "$PHONE" shell input tap "$1" "$2"; }
sw() { "$ADB" -s "$PHONE" shell input swipe "$1" "$2" "$3" "$4" "${5:-300}"; }
back() { "$ADB" -s "$PHONE" shell input keyevent 4; }
txt() { "$ADB" -s "$PHONE" shell input text "$1"; }
