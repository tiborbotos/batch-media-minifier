PRESET=slow
CRF=22

IFS=$'\t\n'

real_path () {
	TARGET_FILE=$1
	cd `dirname $TARGET_FILE`
	TARGET_FILE=`basename $TARGET_FILE`

	while [ -L "$TARGET_FILE" ]
	do
		TARGET_FILE=`readlink $TARGET_FILE`
		cd `dirname $TARGET_FILE`
		TARGET_FILE=`basename $TARGET_FILE`
	done

	PHYS_DIR=`pwd -P`
	RESULT=$PHYS_DIR/$TARGET_FILE
	echo $RESULT
}

rp_fullpath_noext () {
	echo "${1%.*}"
}

SOURCE="`real_path \"$1\"`"
OUTPUT="`rp_fullpath_noext \"$SOURCE\"`"
OUTPUT=$OUTPUT.new.mp4

ffmpeg \
-y \
-hide_banner \
-i "$1" \
-pix_fmt yuv420p \
-c:v libx264 \
-preset $PRESET \
-crf $CRF \
-c:a aac \
-b:a 128k \
-ar 44100 \
-ac 2 \
-movflags +faststart \
$OUTPUT