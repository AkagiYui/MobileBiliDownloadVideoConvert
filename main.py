import json
import os
import hashlib
import subprocess

path_download = r'E:\TempFiles\bilivideo'  # 缓存视频目录
path_output = r'E:\TempFiles\bilivideo'  # 视频输出目录
path_ffmpeg = r'ffmpeg'  # ffmpeg路径
path_ffprobe = 'ffprobe'  # ffprobe路径 用于读取视频分辨率
path_DanmakuFactory = r'E:\OneDrive\Projects\MobileBiliDownloadVideoConvert\DanmakuFactory\DanmakuFactory_REL1.62CLI.exe'  # 弹幕转换程序路径

# 支持的变量 %avid %bvid %title %page_id %page_name %cid
filename_output = '%title - %page_id.%page_name'  # 输出文件名


# 生成输出文件名
def make_output_name(_page_info: dict):
    _output_name = filename_output
    is_season = 'season_id' in _page_info.keys()  # 是否番剧
    if is_season:
        # 番剧
        sub_data = _page_info['ep']
        _output_name = _output_name.replace('%page_name', sub_data['index'])
        _output_name = _output_name.replace('%avid', str(sub_data['av_id']))
        _output_name = _output_name.replace('%bvid', sub_data['bvid'])
        _output_name = _output_name.replace('%cid', str(_page_info['source']['cid']))
    else:
        # 普通视频
        sub_data = _page_info['page_data']
        _output_name = _output_name.replace('%avid', str(_page_info['avid']))
        try:
            _output_name = _output_name.replace('%bvid', _page_info['bvid'])
        except KeyError:
            _output_name = _output_name.replace('%bvid', 'null')
        _output_name = _output_name.replace('%cid', str(sub_data['cid']))
        try:
            _output_name = _output_name.replace('%page_name', sub_data['part'])
        except KeyError:
            _output_name = _output_name.replace('%page_name', _page_info['title'])
    _output_name = _output_name.replace('%page_id', str(sub_data['page']))
    _output_name = _output_name.replace('%title', _page_info['title'])

    return get_usable_filename(_output_name)


# 获取文件md5
def get_file_md5(filename):
    m = hashlib.md5()
    with open(filename, 'rb') as _f:
        m.update(_f.read())
    return m.hexdigest()


# 转换为windows可用的文件名
def get_usable_filename(filename: str):
    filename = filename.replace('/', '_')
    filename = filename.replace('\\', '_')
    filename = filename.replace('*', '_')
    filename = filename.replace('?', '_')
    filename = filename.replace('"', '_')
    filename = filename.replace('<', '_')
    filename = filename.replace('>', '_')
    filename = filename.replace('|', '_')
    filename = filename.replace(':', '_')
    return filename


# 检查音视频文件md5
def check_md5(media_path: str, old=False):
    path_check = os.path.join(media_path, 'index.json')
    with open(path_check, 'r') as _f:
        data = json.load(_f)

    if not old:
        _path_video = os.path.join(media_path, 'video.m4s')
        _path_audio = os.path.join(media_path, 'audio.m4s')

        md5_video = get_file_md5(_path_video)
        if md5_video != data['video'][0]['md5']:
            return False
        md5_audio = get_file_md5(_path_audio)
        if md5_audio != data['audio'][0]['md5']:
            return False
        return True
    else:
        segment_list = data['segment_list']
        for index, segment in enumerate(segment_list):
            md5_media = segment['md5']
            _path_media = os.path.join(media_path, f'{str(index)}.blv')
            md5_file = get_file_md5(_path_media)
            if md5_file != md5_media:
                return False
        return True


if __name__ == '__main__':
    list_avs = os.listdir(path_download)    # 枚举当前目录所有文件
    for path in list_avs:   # 逐av遍历
        if not os.path.isdir(os.path.join(path_download, path)):
            continue  # 跳过非文件夹
        path_current = os.path.join(path_download, path)    # 当前av绝对路径
        list_pages = os.listdir(path_current)   # 枚举所有分P
        multi_pages = len(list_pages) > 1   # 是否多P
        for page in list_pages:  # 逐分P遍历
            if not os.path.isdir(os.path.join(path_current, page)):
                continue    # 跳过非文件夹
            path_page = os.path.join(path_current, page)  # 分P绝对路径

            try:    # 排除非分P目录
                with open(os.path.join(path_page, 'entry.json'), 'r', encoding='utf8') as f:
                    page_info: dict = json.load(f)
            except (FileNotFoundError, ValueError):
                print(f'{path_page} is not a page dir')
                continue

            info_title = page_info['title']  # av标题

            # 多P创建目录
            path_output_current = path_output
            if multi_pages:
                path_output_current = os.path.join(path_output_current, get_usable_filename(info_title))
                if not os.path.isdir(path_output_current):
                    os.mkdir(path_output_current)

            info_type_tag = page_info['type_tag']
            path_media = os.path.join(path_page, info_type_tag)

            output_name = make_output_name(page_info)
            path_output_file = os.path.join(path_output_current, output_name)

            # 判断新旧版本客户端缓存的视频
            # 旧版本：音视频一体/多段
            # 新版本：音视频分离
            if info_type_tag == 'lua.flv.bili2api.80':
                if not check_md5(path_media, True):
                    print(f'{path_media} md5校验失败')
                    continue

                path_check = os.path.join(path_media, 'index.json')
                with open(path_check, 'r') as _f:
                    n_file = len(json.load(_f)['segment_list'])

                list_content = ''
                for index in range(1, n_file):
                    abs_path = os.path.join(path_media, f'{str(index)}.blv')
                    list_content += f"file '{abs_path}'\n"
                list_content = list_content.replace('\\', '\\\\')

                import uuid
                path_filelist = f'{str(uuid.uuid4())}.txt'
                path_filelist = os.path.join(path_output_current, path_filelist)

                with open(path_filelist, 'w', encoding='utf8') as f:
                    f.write(list_content)

                to_run_cmd = f'"{path_ffmpeg}" -y -f concat -safe 0 -i "{path_filelist}" -c copy "{path_output_file}.mp4"'

            else:
                if not check_md5(path_media):
                    print(f'{path_media} md5校验失败')
                    continue

                path_video = os.path.join(path_media, 'video.m4s')
                path_audio = os.path.join(path_media, 'audio.m4s')
                to_run_cmd = f'"{path_ffmpeg}" -y -i "{path_video}" -i "{path_audio}" -c copy "{path_output_file}.mp4"'

            # print(to_run_cmd)
            process = subprocess.Popen(to_run_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            process.stdout.close()
            process.wait()

            if info_type_tag == 'lua.flv.bili2api.80':
                os.remove(path_filelist)

            if process.returncode == 0:
                print(f'{path_page} -> {path_output_file}')
            else:
                print(f'{path_page} -> {path_output_file} 失败')

            # 弹幕转换
            path_danmaku = os.path.join(path_page, 'danmaku.xml')
            if os.path.isfile(path_danmaku):
                to_run_cmd = f'"{path_ffprobe}" -v error -select_streams v:0 -show_entries stream=width,height -of json "{path_output_file}.mp4"'
                value = subprocess.check_output(to_run_cmd)
                data = json.loads(value)
                data = data['streams'][0]

                to_run_cmd = f'"{path_DanmakuFactory}" -r {data["width"]}x{data["height"]} -i "{path_danmaku}" -o "{path_output_file}.ass" --ignore-warnings'
                # print(to_run_cmd)
                process = subprocess.Popen(to_run_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                process.stdout.close()
                process.wait()
