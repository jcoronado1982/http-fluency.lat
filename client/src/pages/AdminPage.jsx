import React, { useEffect, useState, useCallback } from 'react';
import { adminRepository } from '../repositories/adminRepository';
import { formatDeviceType } from '../utils/clientInfo';
import './AdminPage.css';

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function AdminPage() {
    const [data, setData] = useState({ users: [], total: 0, page: 1, total_pages: 1 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async (currentPage) => {
        try {
            const result = await adminRepository.getUsersActivity(currentPage, 25);
            setData(result);
            setError(null);
        } catch (err) {
            setError(err.message || 'Could not load user activity');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(page);
        const interval = setInterval(() => load(page), 30_000);
        return () => clearInterval(interval);
    }, [load, page]);

    const onlineCount = data.users.filter((u) => u.is_online).length;

    return (
        <div className="admin-page">
            <header className="admin-header">
                <h1>Administration Panel</h1>
                <p className="admin-subtitle">
                    {data.total} registered user{data.total !== 1 ? 's' : ''} · {onlineCount} online on this page
                </p>
            </header>

            {loading && data.users.length === 0 && <p className="admin-status">Loading users...</p>}
            {error && <p className="admin-error">{error}</p>}

            {(!loading || data.users.length > 0) && !error && (
                <>
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Status</th>
                                    <th>Device</th>
                                    <th>Country</th>
                                    <th>Visits</th>
                                    <th>Avg Time</th>
                                    <th>Current Session</th>
                                    <th>Last Access</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.users.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="admin-empty">
                                            No registered users yet.
                                        </td>
                                    </tr>
                                ) : (
                                    data.users.map((user) => (
                                        <tr key={user.email} className={user.is_online ? 'row-online' : ''}>
                                            <td>
                                                <div className="admin-user-cell">
                                                    {user.picture && (
                                                        <img
                                                            src={user.picture}
                                                            alt=""
                                                            className="admin-avatar"
                                                        />
                                                    )}
                                                    <div>
                                                        <span className="admin-name">{user.name}</span>
                                                        <span className="admin-email">{user.email}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${user.is_online ? 'online' : 'offline'}`}>
                                                    {user.is_online ? 'Online' : 'Offline'}
                                                </span>
                                            </td>
                                            <td>
                                                {user.device_type ? (
                                                    <div className="admin-device-cell">
                                                        <span className="admin-device-type">
                                                            {formatDeviceType(user.device_type)}
                                                        </span>
                                                        <span className="admin-device-detail">
                                                            {user.browser} · {user.os}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td>{user.country || '—'}</td>
                                            <td>{user.visit_count}</td>
                                            <td>{formatDuration(user.avg_duration_secs)}</td>
                                            <td>
                                                {user.is_online
                                                    ? formatDuration(user.current_session_secs)
                                                    : '—'}
                                            </td>
                                            <td>{formatDate(user.last_login)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {data.total_pages > 1 && (
                        <div className="admin-pagination">
                            <button
                                disabled={data.page === 1}
                                onClick={() => {
                                    setPage((p) => p - 1);
                                    setLoading(true);
                                }}
                            >
                                Previous
                            </button>
                            <span className="pagination-info">
                                Page {data.page} of {data.total_pages}
                            </span>
                            <button
                                disabled={data.page === data.total_pages}
                                onClick={() => {
                                    setPage((p) => p + 1);
                                    setLoading(true);
                                }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
