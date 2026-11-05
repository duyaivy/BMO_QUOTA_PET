#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if pgrep -f "bmo-collector .*collector-native.local.json" > /dev/null; then
    pkill -f "bmo-collector .*collector-native.local.json"
    osascript -e 'display notification "BMO Collector đã dừng hoàn toàn." with title "BMO Quota Pet" sound name "Submarine"'
    echo "BMO Collector đã được dừng thành công!"
else
    osascript -e 'display notification "Không có tiến trình BMO Collector nào đang chạy." with title "BMO Quota Pet"'
    echo "Không tìm thấy tiến trình BMO Collector."
fi
