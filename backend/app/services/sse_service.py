import asyncio
import json
from dataclasses import dataclass
from typing import AsyncGenerator, Dict, List, Optional, Set, Any


@dataclass
class SSEMessage:
    id: str
    event: str
    data: Dict[str, Any]

    def format(self) -> str:
        payload = json.dumps(self.data, ensure_ascii=False)
        return f"id: {self.id}\nevent: {self.event}\ndata: {payload}\n\n"


class SSEManager:
    """Server-Sent Events 广播总线与断线重连事件补偿池"""

    def __init__(self, max_history_per_batch: int = 500):
        self._max_history = max_history_per_batch
        self._history: Dict[str, List[SSEMessage]] = {}
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._counter: int = 0
        self._lock = asyncio.Lock()

    async def publish(self, batch_id: str, event: str, data: Dict[str, Any]) -> SSEMessage:
        """广播事件给批次所有在线客户端，并归档至补偿队列"""
        async with self._lock:
            self._counter += 1
            msg_id = f"evt_{self._counter}"
            message = SSEMessage(id=msg_id, event=event, data=data)

            if batch_id not in self._history:
                self._history[batch_id] = []
            self._history[batch_id].append(message)
            if len(self._history[batch_id]) > self._max_history:
                self._history[batch_id] = self._history[batch_id][-self._max_history:]

            subscribers = list(self._subscribers.get(batch_id, set()))

        for queue in subscribers:
            try:
                queue.put_nowait(message)
            except (asyncio.QueueFull, asyncio.QueueShutDown):
                pass

        return message

    def get_history(self, batch_id: str) -> List[SSEMessage]:
        """获取批次当前事件历史快照"""
        return list(self._history.get(batch_id, []))

    async def subscribe(
        self,
        batch_id: str,
        last_event_id: Optional[str] = None,
        heartbeat_interval: float = 15.0,
    ) -> AsyncGenerator[str, None]:
        """客户端订阅通道：自动执行 Last-Event-ID 补偿补发与心跳保持"""
        queue: asyncio.Queue[Optional[SSEMessage]] = asyncio.Queue(maxsize=200)

        # 1. 查找待补偿历史事件
        replay_events: List[SSEMessage] = []
        async with self._lock:
            if batch_id not in self._subscribers:
                self._subscribers[batch_id] = set()
            self._subscribers[batch_id].add(queue)

            history = self._history.get(batch_id, [])
            if last_event_id:
                start_idx = -1
                for idx, ev in enumerate(history):
                    if ev.id == last_event_id:
                        start_idx = idx
                        break
                if start_idx != -1 and start_idx + 1 < len(history):
                    replay_events = list(history[start_idx + 1:])
                elif start_idx == -1:
                    # 传入未知 ID，兜底补发全部历史
                    replay_events = list(history)
            else:
                replay_events = list(history)

        try:
            # 2. 优先按顺序补发历史事件
            for msg in replay_events:
                yield msg.format()

            # 3. 实时侦听新事件，超时发送心跳注释
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=heartbeat_interval)
                    if msg is None:
                        break
                    yield msg.format()
                except asyncio.TimeoutError:
                    # 每 15 秒发送标准 SSE 心跳注释行，防止网关连接断开
                    yield ": keepalive\n\n"
        finally:
            async with self._lock:
                if batch_id in self._subscribers:
                    self._subscribers[batch_id].discard(queue)
                    if not self._subscribers[batch_id]:
                        del self._subscribers[batch_id]


sse_manager = SSEManager()
