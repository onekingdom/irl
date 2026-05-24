# ── Stage 1: Build FFmpeg with NDI + SRT support ──
FROM debian:bookworm-slim AS ffmpeg-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git build-essential nasm yasm pkg-config \
    libsrt-openssl-dev libx264-dev libx265-dev \
    libavahi-client-dev \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone https://github.com/lplassman/FFMPEG-NDI.git && \
    git clone https://git.ffmpeg.org/ffmpeg.git && \
    cd ffmpeg && git checkout n5.1

WORKDIR /build/ffmpeg
RUN git config user.email "build@docker" && git config user.name "build" && \
    git am ../FFMPEG-NDI/libndi.patch && \
    cp ../FFMPEG-NDI/libavdevice/libndi_newtek_* libavdevice/

RUN curl -s https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v5_Linux.tar.gz | tar xz -C /tmp/ && \
    yes y | bash /tmp/Install_NDI_SDK_v5_Linux.sh > /dev/null && \
    cp -R "NDI SDK for Linux"/include/* /usr/include/ && \
    cp -R "NDI SDK for Linux"/lib/x86_64-linux-gnu/* /usr/lib/

RUN PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig" \
    ./configure \
    --enable-gpl \
    --enable-nonfree \
    --enable-libsrt \
    --enable-libx264 \
    --enable-libx265 \
    --enable-encoder=aac \
    --enable-libndi_newtek \
    --extra-cflags="$(pkg-config --cflags srt x264 x265)" \
    --extra-ldflags="$(pkg-config --libs-only-L srt x264 x265)" && \
    make -j$(nproc) && \
    make install

# Collect media-specific shared libraries (exclude core system libs like libc, libm, libpthread, ld-linux)
RUN mkdir -p /runtime-libs && \
    ldd /usr/local/bin/ffmpeg | grep "=> /" | awk '{print $3}' | sort -u | \
    while read lib; do \
      basename="$(basename "$lib")"; \
      case "$basename" in \
        libc.so*|libm.so*|libpthread.so*|libdl.so*|librt.so*|ld-linux*|libgcc_s*|libstdc++*) ;; \
        *) cp -L "$lib" /runtime-libs/ 2>/dev/null || true ;; \
      esac; \
    done && \
    cp -L /usr/lib/libndi* /runtime-libs/ 2>/dev/null || true && \
    ls -la /runtime-libs/

# ── Stage 2: Runtime image ──
FROM oven/bun:1 AS base

# Copy ffmpeg binaries
COPY --from=ffmpeg-builder /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-builder /usr/local/bin/ffprobe /usr/local/bin/ffprobe

# Copy all runtime shared libraries and refresh linker cache
COPY --from=ffmpeg-builder /runtime-libs/ /usr/local/lib/
RUN ldconfig

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p /app/data/logs

EXPOSE 8080
EXPOSE 10000-10099

CMD ["bun", "run", "src/index.ts"]
