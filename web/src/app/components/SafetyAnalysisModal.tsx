'use client';

import React from 'react';
import { WeatherData, CrashAnalysisData } from '../../lib/flaskApi';

interface SafetyAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  weatherData?: WeatherData;
  crashAnalysis?: CrashAnalysisData;
  coordinates?: [number, number];
}

export default function SafetyAnalysisModal({ 
  isOpen, 
  onClose, 
  weatherData, 
  crashAnalysis,
  coordinates 
}: SafetyAnalysisModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'var(--panel-lightest)',
          borderRadius: 12,
          maxWidth: '800px',
          maxHeight: '80vh',
          width: '100%',
          overflowY: 'auto',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--panel-border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--panel-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ 
              margin: 0, 
              fontSize: 20, 
              fontWeight: 600, 
              color: 'var(--text-primary)' 
            }}>
              📊 Detailed Safety Analysis
            </h2>
            {coordinates && (
              <div style={{ 
                fontSize: 12, 
                color: 'var(--text-secondary)', 
                marginTop: 4 
              }}>
                Location: {coordinates[1].toFixed(5)}, {coordinates[0].toFixed(5)}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 4,
              borderRadius: 4
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel-light)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ×
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '20px 24px' }}>
          
          {/* Weather Section */}
          {weatherData && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ 
                fontSize: 16, 
                fontWeight: 600, 
                color: 'var(--text-primary)', 
                margin: '0 0 12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                🌤️ Weather Conditions
              </h3>
              <div style={{
                backgroundColor: 'var(--panel-light)',
                padding: 16,
                borderRadius: 8,
                fontSize: 14,
                color: 'var(--text-secondary)'
              }}>
                {weatherData.summary && (
                  <div style={{ 
                    fontStyle: 'italic', 
                    marginBottom: 12,
                    color: 'var(--text-primary)',
                    fontSize: 15
                  }}>
                    {weatherData.summary}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {weatherData.description && (
                    <div><strong>Conditions:</strong> {weatherData.description}</div>
                  )}
                  {weatherData.temperature !== undefined && (
                    <div><strong>Temperature:</strong> {weatherData.temperature}°C</div>
                  )}
                  {weatherData.humidity !== undefined && (
                    <div><strong>Humidity:</strong> {weatherData.humidity}%</div>
                  )}
                  {weatherData.windSpeed !== undefined && (
                    <div><strong>Wind Speed:</strong> {weatherData.windSpeed} km/h</div>
                  )}
                  {weatherData.precipitation !== undefined && (
                    <div><strong>Precipitation:</strong> {weatherData.precipitation} mm/h</div>
                  )}
                  {weatherData.visibility !== undefined && (
                    <div><strong>Visibility:</strong> {weatherData.visibility} km</div>
                  )}
                  {weatherData.timeOfDay && (
                    <div><strong>Time of Day:</strong> {weatherData.timeOfDay}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Crash Statistics */}
          {crashAnalysis?.crashSummary && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ 
                fontSize: 16, 
                fontWeight: 600, 
                color: 'var(--text-primary)', 
                margin: '0 0 12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                🚗 Crash Statistics
              </h3>
              <div style={{
                backgroundColor: 'var(--panel-light)',
                padding: 16,
                borderRadius: 8,
                fontSize: 14,
                color: 'var(--text-secondary)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <div>
                    <strong>Total Crashes:</strong> {crashAnalysis.crashSummary.totalCrashes?.toLocaleString()}
                  </div>
                  <div>
                    <strong>Total Casualties:</strong> {crashAnalysis.crashSummary.totalCasualties?.toLocaleString()}
                  </div>
                </div>
                
                {crashAnalysis.crashSummary.severityBreakdown && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Severity Breakdown:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                      {Object.entries(crashAnalysis.crashSummary.severityBreakdown).map(([severity, count]) => (
                        <div key={severity} style={{
                          padding: 8,
                          backgroundColor: 'var(--panel-lightest)',
                          borderRadius: 4,
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: 12, opacity: 0.8 }}>{severity}</div>
                          <div style={{ fontSize: 16, fontWeight: 600 }}>{String(count)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Risk Assessment */}
          {crashAnalysis?.riskLevel && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ 
                fontSize: 16, 
                fontWeight: 600, 
                color: 'var(--text-primary)', 
                margin: '0 0 12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                ⚠️ Risk Assessment
              </h3>
              <div style={{
                backgroundColor: crashAnalysis.riskLevel === 'high' ? '#ffeaea' : 
                                crashAnalysis.riskLevel === 'medium' ? '#fff3cd' : '#d4edda',
                color: crashAnalysis.riskLevel === 'high' ? '#721c24' : 
                       crashAnalysis.riskLevel === 'medium' ? '#856404' : '#155724',
                padding: 16,
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                textAlign: 'center'
              }}>
                Risk Level: {crashAnalysis.riskLevel.toUpperCase()}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {crashAnalysis?.recommendations && crashAnalysis.recommendations.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ 
                fontSize: 16, 
                fontWeight: 600, 
                color: 'var(--text-primary)', 
                margin: '0 0 12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                💡 Safety Recommendations
              </h3>
              <div style={{
                backgroundColor: 'var(--panel-light)',
                padding: 16,
                borderRadius: 8,
                fontSize: 14,
                color: 'var(--text-secondary)'
              }}>
                {crashAnalysis.recommendations.map((rec: string, i: number) => (
                  <div key={i} style={{ 
                    marginBottom: 12, 
                    padding: 12,
                    backgroundColor: 'var(--panel-lightest)',
                    borderRadius: 6,
                    borderLeft: '3px solid var(--accent-primary)'
                  }}>
                    <strong>{i + 1}.</strong> {rec}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Safety Analysis */}
          {crashAnalysis?.safetyAnalysis && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ 
                fontSize: 16, 
                fontWeight: 600, 
                color: 'var(--text-primary)', 
                margin: '0 0 12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                📋 Complete Safety Analysis
              </h3>
              <div style={{
                backgroundColor: 'var(--panel-light)',
                padding: 16,
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--text-secondary)',
                maxHeight: '300px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace'
              }}>
                {crashAnalysis.safetyAnalysis}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px 20px',
          borderTop: '1px solid var(--panel-border)',
          textAlign: 'right'
        }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-primary-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-primary)'}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}