import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminRoute = ({ children }) => {
    const { isAuthenticated, loading, role } = useAuth();

    if (loading) {
        return (
            <div style={{
                height: '100vh',
                background: '#0f172a',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'white',
            }}>
                Cargando...
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" />;
    }

    if (role !== 'admin') {
        return <Navigate to="/" />;
    }

    return children;
};

export default AdminRoute;
