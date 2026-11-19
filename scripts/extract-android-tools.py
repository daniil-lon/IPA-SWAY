from pathlib import Path
from zipfile import ZipFile
root=Path('.tools/android-sdk').resolve()
for filename,target in [('platform-35-ext15_r01.zip','platforms/android-35'),('build-tools_r35_windows.zip','build-tools/35.0.0'),('platform-tools_r37.0.3-win.zip','platform-tools')]:
    destination=(root/target).resolve()
    assert destination.is_relative_to(root)
    with ZipFile(Path('.tools/android-downloads')/filename) as archive:
        for member in archive.infolist():
            pieces=Path(member.filename).parts[1:]
            if not pieces: continue
            output=destination.joinpath(*pieces).resolve()
            assert output.is_relative_to(destination)
            if member.is_dir(): output.mkdir(parents=True,exist_ok=True)
            else:
                output.parent.mkdir(parents=True,exist_ok=True)
                with archive.open(member) as source,output.open('wb') as sink:
                    while chunk:=source.read(1024*1024): sink.write(chunk)
    print('Prepared',target)
