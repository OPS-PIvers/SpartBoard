import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { UserRolesConfig } from '@/types';
import { Toast } from '@/components/common/Toast';
import {
  Save,
  Users,
  GraduationCap,
  Star,
  Shield,
  ShieldAlert,
} from 'lucide-react';

const DEFAULT_ROLES: UserRolesConfig = {
  students: [],
  teachers: [],
  betaTeachers: [],
  admins: [],
  superAdmins: [],
};

const RoleSection: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  emails: string[];
  onChange: (emails: string[]) => void;
}> = ({ title, description, icon, emails, onChange }) => {
  const [inputText, setInputText] = useState(emails.join('\n'));
  const [prevEmailsStr, setPrevEmailsStr] = useState(emails.join('\n'));

  // Sync prop changes back to local state if external updates happen
  // avoiding useEffect for deriving state to prevent extra re-renders.
  // We use string comparison to avoid reference inequality loops.
  const emailsStr = emails.join('\n');
  if (emailsStr !== prevEmailsStr) {
    setPrevEmailsStr(emailsStr);
    setInputText(emailsStr);
  }

  const handleBlur = () => {
    const updatedEmails = inputText
      .split(/[\n,]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes('@'));

    // De-duplicate
    const uniqueEmails = Array.from(new Set(updatedEmails));
    onChange(uniqueEmails);
    setInputText(uniqueEmails.join('\n'));
  };

  return (
    <div className="bg-white border-2 border-slate-200 rounded-xl p-4 hover:border-brand-blue-light transition-colors">
      <div className="flex items-start gap-3 mb-3">
        <div className="bg-slate-100 p-2 rounded-lg text-slate-600 shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500 leading-snug">{description}</p>
        </div>
        <div className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
          {emails.length} users
        </div>
      </div>
      <textarea
        aria-label={`${title} Emails`}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Enter email addresses (one per line or comma-separated)"
        className="w-full h-32 p-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-transparent resize-y"
      />
    </div>
  );
};

export const UserManagementPanel: React.FC = () => {
  const [roles, setRoles] = useState<UserRolesConfig>(DEFAULT_ROLES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const messageTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    clearTimeout(messageTimeoutRef.current);
    setMessage({ type, text });
    messageTimeoutRef.current = setTimeout(() => {
      setMessage(null);
    }, 3000);
  }, []);

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => clearTimeout(messageTimeoutRef.current);
  }, []);

  useEffect(() => {
    const loadRoles = async () => {
      if (isAuthBypass) {
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'admin_settings', 'user_roles');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setRoles({ ...DEFAULT_ROLES, ...(snap.data() as UserRolesConfig) });
        }
      } catch (error) {
        console.error('Error loading user roles:', error);
        showMessage('error', 'Failed to load user roles');
      } finally {
        setLoading(false);
      }
    };

    void loadRoles();
  }, [showMessage]);

  const handleSave = async () => {
    if (isAuthBypass) {
      setHasChanges(false);
      showMessage('success', 'Changes saved (mock)');
      return;
    }

    try {
      setSaving(true);
      await setDoc(doc(db, 'admin_settings', 'user_roles'), roles);
      setHasChanges(false);
      showMessage('success', 'User roles updated successfully');
    } catch (error) {
      console.error('Error saving user roles:', error);
      showMessage('error', 'Failed to save user roles');
    } finally {
      setSaving(false);
    }
  };

  const updateRole = (roleKey: keyof UserRolesConfig, emails: string[]) => {
    setRoles((prev) => ({ ...prev, [roleKey]: emails }));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading user roles...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">User Management</h2>
          <p className="text-sm text-slate-500">
            Control access levels across the platform by assigning emails to
            specific roles.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all ${
            hasChanges
              ? 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white shadow-sm'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RoleSection
          title="Students"
          description="Basic student access. (Currently reserved for medium-term roadmap feature rollout)"
          icon={<GraduationCap size={20} />}
          emails={roles.students}
          onChange={(emails) => updateRole('students', emails)}
        />

        <RoleSection
          title="Teachers (Standard)"
          description="Standard teacher access with default feature permissions."
          icon={<Users size={20} />}
          emails={roles.teachers}
          onChange={(emails) => updateRole('teachers', emails)}
        />

        <RoleSection
          title="Teachers (Beta)"
          description="Teachers who automatically get access to any widget or feature marked with 'Beta' availability."
          icon={<Star size={20} className="text-blue-500" />}
          emails={roles.betaTeachers}
          onChange={(emails) => updateRole('betaTeachers', emails)}
        />

        <RoleSection
          title="Admins"
          description="Administrators who can access admin settings, manage widgets, and access beta features."
          icon={<Shield size={20} className="text-purple-500" />}
          emails={roles.admins}
          onChange={(emails) => updateRole('admins', emails)}
        />

        <RoleSection
          title="Super Admins"
          description="Top-level administrators with full system access. Includes all Admin and Beta privileges."
          icon={<ShieldAlert size={20} className="text-red-500" />}
          emails={roles.superAdmins}
          onChange={(emails) => updateRole('superAdmins', emails)}
        />
      </div>
    </div>
  );
};
