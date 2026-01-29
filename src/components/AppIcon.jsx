import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUser, faUpload, faFolderOpen, faEnvelope, faShieldAlt, faUserCheck, faPaperPlane, faSave,
    faFileText, faKey, faBalanceScale, faArrowLeft, faShield, faBars, faTimes,
    faLock, faDollarSign, faUserSlash, faUsers, faExclamationTriangle,
    faExclamationCircle, faInfoCircle, faCheckCircle, faCalendar, faMapMarkerAlt,
    faPaperclip, faCodeBranch, faCopy, faDownload, faPrint, faCheck, faFileAlt,
    faSignInAlt, faSignOutAlt, faCircleNotch, faQuestionCircle, faGlobe, faChevronDown, faChevronRight,
    faChevronUp, faClock, faEllipsisV, faEye, faUserPlus, faInbox, faArrowUp, faArrowDown,
    faMinus, faCog, faThLarge, faChartBar, faList, faSync, faEdit, faShare, faPhone, faPlus,
    faHistory, faComment, faCommentDots, faCheckDouble, faExternalLinkAlt, faSearch, faPlusCircle,
    faFileUpload, faClipboardList, faSpinner, faTh, faPencilAlt, faTrash, faFolder, faLanguage,
    faEraser, faFilter, faScroll, faExchangeAlt, faStar
} from '@fortawesome/free-solid-svg-icons';

// Icon name mapping from Lucide to Font Awesome
const iconMap = {
    'FileText': faFileText,
    'Key': faKey,
    'Scale': faBalanceScale,
    'ArrowLeft': faArrowLeft,
    'Shield': faShield,
    'Menu': faBars,
    'X': faTimes,
    'Lock': faLock,
    'DollarSign': faDollarSign,
    'UserX': faUserSlash,
    'Users': faUsers,
    'AlertTriangle': faExclamationTriangle,
    'AlertCircle': faExclamationCircle,
    'AlertOctagon': faExclamationTriangle,
    'Info': faInfoCircle,
    'CheckCircle': faCheckCircle,
    'CheckCircle2': faCheckCircle,
    'Calendar': faCalendar,
    'MapPin': faMapMarkerAlt,
    'Paperclip': faPaperclip,
    'CodeBranch': faCodeBranch,
    'Copy': faCopy,
    'Download': faDownload,
    'Printer': faPrint,
    'Check': faCheck,
    'File': faFileAlt,
    'LogIn': faSignInAlt,
    'Loader': faCircleNotch,
    'HelpCircle': faQuestionCircle,
    'Globe': faGlobe,
    'User': faUser,
    'Upload': faUpload,
    'FolderOpen': faFolderOpen,
    'Mail': faEnvelope,
    'ShieldCheck': faShieldAlt,
    'ShieldAlert': faShieldAlt,
    'UserCheck': faUserCheck,
    'Send': faPaperPlane,
    'Save': faSave,
    'ChevronDown': faChevronDown,
    'ChevronRight': faChevronRight,
    'ChevronUp': faChevronUp,
    'Clock': faClock,
    'Timer': faClock,
    'MoreVertical': faEllipsisV,
    'Eye': faEye,
    'UserPlus': faUserPlus,
    'Inbox': faInbox,
    'ArrowUp': faArrowUp,
    'ArrowDown': faArrowDown,
    'Minus': faMinus,
    'TrendingUp': faArrowUp,
    'TrendingDown': faArrowDown,
    'Settings': faCog,
    'LogOut': faSignOutAlt,
    'LayoutDashboard': faThLarge,
    'BarChart3': faChartBar,
    'ListChecks': faList,
    'RefreshCw': faSync,
    'Edit': faEdit,
    'Share2': faShare,
    'Phone': faPhone,
    'GitBranch': faCodeBranch,
    'Plus': faPlus,
    'History': faHistory,
    'MessageSquare': faComment,
    'MessageCircle': faCommentDots,
    'CheckCheck': faCheckDouble,
    'FileEdit': faEdit,
    'List': faList,
    'ExternalLink': faExternalLinkAlt,
    'Search': faSearch,
    'PlusCircle': faPlusCircle,
    'FileUpload': faFileUpload,
    'ClipboardList': faClipboardList,
    'RefreshCcw': faSync,
    'Loader2': faSpinner,
    'Grid': faTh,
    'LayoutGrid': faTh,
    'Pencil': faPencilAlt,
    'Trash2': faTrash,
    'Folder': faFolder,
    'Languages': faLanguage,
    'Eraser': faEraser,
    'Filter': faFilter,
    'ScrollText': faScroll,
    'ArrowRightLeft': faExchangeAlt,
    'Sparkles': faStar
};

function Icon({
    name,
    size = 24,
    color = "currentColor",
    className = "",
    ...props
}) {
    const icon = iconMap[name];

    if (!icon) {
        // Silently use fallback icon instead of warning
        return (
            <FontAwesomeIcon
                icon={faQuestionCircle}
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    color: 'gray'
                }}
                className={className}
                {...props}
            />
        );
    }

    // Add spin animation for loader icons
    const shouldSpin = name === 'Loader' || name === 'Loader2';
    const finalClassName = shouldSpin ? `${className} fa-spin` : className;

    return (
        <FontAwesomeIcon
            icon={icon}
            style={{
                width: `${size}px`,
                height: `${size}px`,
                color: color
            }}
            className={finalClassName}
            {...props}
        />
    );
}

export default Icon;