import {
  ChatToggle,
  ControlBarProps,
  DisconnectButton,
  formatChatMessageLinks,
  LiveKitRoom,
  LocalUserChoices,
  MediaDeviceMenu,
  PreJoinProps,
  StartAudio,
  TrackToggle,
  useLocalParticipantPermissions,
  useMaybeLayoutContext,
  usePreviewTracks,
} from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  facingModeFromLocalTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  LogLevel,
  Room,
  RoomConnectOptions,
  RoomOptions,
  Track,
  VideoCodec,
  VideoPresets,
} from 'livekit-client';
import { supportsScreenSharing } from '@livekit/components-core';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { decodePassphrase } from '../../lib/client-utils';
import { DebugMode } from '../../lib/Debug';
import React from 'react';
import SvgLeaveIcon from '../../lib/leaveicon';
import SvgChatIcon from '../../lib/chaticon';
import { useMediaQuery } from '../../lib/usemediaquery';
import { mergeProps } from '../../lib/mergeProps';
import { VideoConference } from '../../lib/videoConference';
import dynamic from 'next/dynamic';
import { log } from 'console';
import SvgParticipantPlaceholder from '../../lib/participantplacehold';

const PreJoinNoSSR = dynamic(
  async () => {
    return PreJoin;
  },
  { ssr: false },
);

export default function CustomRoomConnection() {
  const router = useRouter();
  const { liveKitUrl, token, codec } = router.query;

  const e2eePassphrase =
    typeof window !== 'undefined' && decodePassphrase(window.location.hash.substring(1));
  const worker =
    typeof window !== 'undefined' &&
    new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
  const keyProvider = new ExternalE2EEKeyProvider();

  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices | undefined>(undefined);

  function handlePreJoinSubmit(values: LocalUserChoices) {
    setPreJoinChoices(values);
  }

  const e2eeEnabled = !!(e2eePassphrase && worker);

  const roomOptions = useMemo((): RoomOptions => {
    return {
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h216],
        red: !e2eeEnabled,
        videoCodec: codec as VideoCodec | undefined,
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: e2eeEnabled
        ? {
            keyProvider,
            worker,
          }
        : undefined,
    };
  }, []);

  const room = useMemo(() => new Room(roomOptions), []);
  if (e2eeEnabled) {
    keyProvider.setKey(e2eePassphrase);
    room.setE2EEEnabled(true);
  }

  const connectOptions = useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  if (typeof liveKitUrl !== 'string') {
    return <h2>Missing LiveKit URL</h2>;
  }
  if (typeof token !== 'string') {
    return <h2>Missing LiveKit token</h2>;
  }

  return (
    <main data-lk-theme="default">
      {preJoinChoices ? (
        liveKitUrl && (
          <LiveKitRoom
            room={room}
            token={token}
            connectOptions={connectOptions}
            serverUrl={liveKitUrl}
            audio={preJoinChoices.audioEnabled}
            video={preJoinChoices.videoEnabled}
          >
            <VideoConference chatMessageFormatter={formatChatMessageLinks} />
            <ControlBar variation="verbose" />
            <DebugMode logLevel={LogLevel.info} />
          </LiveKitRoom>
        )
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <PreJoinNoSSR
            micLabel="Микрофон"
            camLabel="Камера"
            joinLabel="Присоединиться"
            userLabel="Ваше Имя"
            onError={(err) => console.log('error while setting up prejoin', err)}
            defaults={{
              videoEnabled: true,
              audioEnabled: true,
              e2ee: false,
            }}
            onSubmit={handlePreJoinSubmit}
            showE2EEOptions={false}
          ></PreJoinNoSSR>
        </div>
      )}
    </main>
  );
}

export function ControlBar({ variation, controls, ...props }: ControlBarProps) {
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const layoutContext = useMaybeLayoutContext();
  React.useEffect(() => {
    if (layoutContext?.widget.state?.showChat !== undefined) {
      setIsChatOpen(layoutContext?.widget.state?.showChat);
    }
  }, [layoutContext?.widget.state?.showChat]);
  const isTooLittleSpace = useMediaQuery(`(max-width: ${isChatOpen ? 1000 : 760}px)`);

  const defaultVariation = isTooLittleSpace ? 'minimal' : 'verbose';
  variation ??= defaultVariation;

  const visibleControls = { leave: true, ...controls };

  const localPermissions = useLocalParticipantPermissions();

  if (!localPermissions) {
    visibleControls.camera = false;
    visibleControls.chat = false;
    visibleControls.microphone = false;
    visibleControls.screenShare = false;
  } else {
    visibleControls.camera ??= localPermissions.canPublish;
    visibleControls.microphone ??= localPermissions.canPublish;
    visibleControls.screenShare ??= localPermissions.canPublish;
    visibleControls.chat ??= localPermissions.canPublishData && controls?.chat;
  }

  const showIcon = React.useMemo(
    () => variation === 'minimal' || variation === 'verbose',
    [variation],
  );
  const showText = React.useMemo(
    () => variation === 'textOnly' || variation === 'verbose',
    [variation],
  );

  const browserSupportsScreenSharing = supportsScreenSharing();

  const [isScreenShareEnabled, setIsScreenShareEnabled] = React.useState(false);

  const onScreenShareChange = (enabled: boolean) => {
    setIsScreenShareEnabled(enabled);
  };

  const htmlProps = mergeProps({ className: 'lk-control-bar' }, props);

  return (
    <div {...htmlProps}>
      {visibleControls.microphone && (
        <div className="lk-button-group">
          <TrackToggle source={Track.Source.Microphone} showIcon={showIcon}>
            {showText && 'Микрофон'}
          </TrackToggle>
          <div className="lk-button-group-menu">
            <MediaDeviceMenu kind="audioinput" />
          </div>
        </div>
      )}
      {visibleControls.camera && (
        <div className="lk-button-group">
          <TrackToggle source={Track.Source.Camera} showIcon={showIcon}>
            {showText && 'Камера'}
          </TrackToggle>
          <div className="lk-button-group-menu">
            <MediaDeviceMenu kind="videoinput" />
          </div>
        </div>
      )}
      {visibleControls.screenShare && browserSupportsScreenSharing && (
        <TrackToggle
          source={Track.Source.ScreenShare}
          captureOptions={{ audio: true, selfBrowserSurface: 'include' }}
          showIcon={showIcon}
          onChange={onScreenShareChange}
        >
          {showText && (isScreenShareEnabled ? 'Поделиться Экраном' : 'Поделиться Экраном')}
        </TrackToggle>
      )}
      {visibleControls.chat && (
        <ChatToggle>
          {showIcon && <SvgChatIcon />}
          {showText && 'Чат'}
        </ChatToggle>
      )}
      {visibleControls.leave && (
        <DisconnectButton>
          {showIcon && <SvgLeaveIcon />}
          {showText && 'Покинуть Конференцию'}
        </DisconnectButton>
      )}
      <StartAudio label="Start Audio" />
    </div>
  );
}

const DEFAULT_USER_CHOICES: LocalUserChoices = {
  username: '',
  videoEnabled: true,
  audioEnabled: true,
  videoDeviceId: 'default',
  audioDeviceId: 'default',
  e2ee: false,
  sharedPassphrase: '',
};

export function PreJoin({
  defaults = {},
  onValidate,
  onSubmit,
  onError,
  debug,
  joinLabel = 'Join Room',
  micLabel = 'Microphone',
  camLabel = 'Camera',
  userLabel = 'Username',
  showE2EEOptions = false,
  ...htmlProps
}: PreJoinProps) {
  const [userChoices, setUserChoices] = React.useState(DEFAULT_USER_CHOICES);
  const [username, setUsername] = React.useState(
    defaults.username ?? DEFAULT_USER_CHOICES.username,
  );
  const [videoEnabled, setVideoEnabled] = React.useState<boolean>(
    defaults.videoEnabled ?? DEFAULT_USER_CHOICES.videoEnabled,
  );
  const initialVideoDeviceId = defaults.videoDeviceId ?? DEFAULT_USER_CHOICES.videoDeviceId;
  const [videoDeviceId, setVideoDeviceId] = React.useState<string>(initialVideoDeviceId);
  const initialAudioDeviceId = defaults.audioDeviceId ?? DEFAULT_USER_CHOICES.audioDeviceId;
  const [audioEnabled, setAudioEnabled] = React.useState<boolean>(
    defaults.audioEnabled ?? DEFAULT_USER_CHOICES.audioEnabled,
  );
  const [audioDeviceId, setAudioDeviceId] = React.useState<string>(initialAudioDeviceId);
  const [e2ee, setE2ee] = React.useState<boolean>(defaults.e2ee ?? DEFAULT_USER_CHOICES.e2ee);
  const [sharedPassphrase, setSharedPassphrase] = React.useState<string>(
    defaults.sharedPassphrase ?? DEFAULT_USER_CHOICES.sharedPassphrase,
  );

  const tracks = usePreviewTracks(
    {
      audio: audioEnabled ? { deviceId: initialAudioDeviceId } : false,
      video: videoEnabled ? { deviceId: initialVideoDeviceId } : false,
    },
    onError,
  );

  const videoEl = React.useRef(null);

  const videoTrack = React.useMemo(
    () =>
      tracks?.filter(
        (track: { kind: Track.Kind }) => track.kind === Track.Kind.Video,
      )[0] as LocalVideoTrack,
    [tracks],
  );

  const facingMode = React.useMemo(() => {
    if (videoTrack) {
      const { facingMode } = facingModeFromLocalTrack(videoTrack);
      return facingMode;
    } else {
      return 'undefined';
    }
  }, [videoTrack]);

  const audioTrack = React.useMemo(
    () =>
      tracks?.filter(
        (track: { kind: Track.Kind }) => track.kind === Track.Kind.Audio,
      )[0] as LocalAudioTrack,
    [tracks],
  );

  React.useEffect(() => {
    if (videoEl.current && videoTrack) {
      videoTrack.unmute();
      videoTrack.attach(videoEl.current);
    }

    return () => {
      videoTrack?.detach();
    };
  }, [videoTrack]);

  const [isValid, setIsValid] = React.useState<boolean>();

  const handleValidation = React.useCallback(
    (values: LocalUserChoices) => {
      if (typeof onValidate === 'function') {
        return onValidate(values);
      } else {
        return values.username === '';
      }
    },
    [onValidate],
  );

  React.useEffect(() => {
    const newUserChoices = {
      username,
      videoEnabled,
      videoDeviceId,
      audioEnabled,
      audioDeviceId,
      e2ee,
      sharedPassphrase,
    };
    setUserChoices(newUserChoices);
    setIsValid(handleValidation(newUserChoices));
  }, [
    username,
    videoEnabled,
    handleValidation,
    audioEnabled,
    audioDeviceId,
    videoDeviceId,
    sharedPassphrase,
    e2ee,
  ]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (handleValidation(userChoices)) {
      if (typeof onSubmit === 'function') {
        onSubmit(userChoices);
      }
    } else {
    }
  }

  return (
    <div className="lk-prejoin" {...htmlProps}>
      <div className="lk-video-container">
        {videoTrack && (
          <video ref={videoEl} width="1280" height="720" data-lk-facing-mode={facingMode} />
        )}
        {(!videoTrack || !videoEnabled) && (
          <div className="lk-camera-off-note">
            <SvgParticipantPlaceholder />
          </div>
        )}
      </div>
      <div className="lk-button-group-container">
        <div className="lk-button-group audio">
          <TrackToggle
            initialState={audioEnabled}
            source={Track.Source.Microphone}
            onChange={(enabled) => setAudioEnabled(enabled)}
          >
            {micLabel}
          </TrackToggle>
          <div className="lk-button-group-menu">
            <MediaDeviceMenu
              initialSelection={audioDeviceId}
              kind="audioinput"
              disabled={!audioTrack}
              tracks={{ audioinput: audioTrack }}
              onActiveDeviceChange={(_, id) => setAudioDeviceId(id)}
            />
          </div>
        </div>
        <div className="lk-button-group video">
          <TrackToggle
            initialState={videoEnabled}
            source={Track.Source.Camera}
            onChange={(enabled) => setVideoEnabled(enabled)}
          >
            {camLabel}
          </TrackToggle>
          <div className="lk-button-group-menu">
            <MediaDeviceMenu
              initialSelection={videoDeviceId}
              kind="videoinput"
              disabled={!videoTrack}
              tracks={{ videoinput: videoTrack }}
              onActiveDeviceChange={(_, id) => setVideoDeviceId(id)}
            />
          </div>
        </div>
      </div>

      <form className="lk-username-container">
        {showE2EEOptions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
              <input
                id="use-e2ee"
                type="checkbox"
                checked={e2ee}
                onChange={(ev) => setE2ee(ev.target.checked)}
              ></input>
              <label htmlFor="use-e2ee">Enable end-to-end encryption</label>
            </div>
            {e2ee && (
              <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
                <label htmlFor="passphrase">Passphrase</label>
                <input
                  id="passphrase"
                  type="password"
                  value={sharedPassphrase}
                  onChange={(ev) => setSharedPassphrase(ev.target.value)}
                />
              </div>
            )}
          </div>
        )}
        <button className="lk-button lk-join-button" type="submit" onClick={handleSubmit}>
          {joinLabel}
        </button>
      </form>

      {debug && (
        <>
          <strong>User Choices:</strong>
          <ul className="lk-list" style={{ overflow: 'hidden', maxWidth: '15rem' }}>
            <li>Username: {`${userChoices.username}`}</li>
            <li>Video Enabled: {`${userChoices.videoEnabled}`}</li>
            <li>Audio Enabled: {`${userChoices.audioEnabled}`}</li>
            <li>Video Device: {`${userChoices.videoDeviceId}`}</li>
            <li>Audio Device: {`${userChoices.audioDeviceId}`}</li>
          </ul>
        </>
      )}
    </div>
  );
}
