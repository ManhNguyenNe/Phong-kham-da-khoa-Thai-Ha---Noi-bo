import { useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2 } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface QRPaymentModalProps {
    open: boolean
    qrCode: string | null
    orderCode: number | null
    amount: number
    isConnecting?: boolean
    paymentSuccess?: boolean
    onClose: () => void
    onForceClose: () => void
}

export function QRPaymentModal({
    open,
    qrCode,
    orderCode,
    amount,
    isConnecting = false,
    paymentSuccess = false,
    onClose,
    onForceClose,
}: QRPaymentModalProps) {
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)

    // Handle Escape key press
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && open && !paymentSuccess) {
                e.preventDefault()
                setShowConfirmDialog(true)
            }
        }

        if (open) {
            document.addEventListener('keydown', handleEscape)
        }

        return () => {
            document.removeEventListener('keydown', handleEscape)
        }
    }, [open, paymentSuccess])

    const handleCloseAttempt = () => {
        if (paymentSuccess) {
            // Allow closing if payment is successful
            onClose()
        } else {
            // Show confirmation dialog
            setShowConfirmDialog(true)
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCloseAttempt()}>
                <DialogContent
                    className="sm:max-w-md"
                    showCloseButton={false}
                    onPointerDownOutside={(e) => {
                        if (!paymentSuccess) {
                            e.preventDefault()
                            setShowConfirmDialog(true)
                        }
                    }}
                    onEscapeKeyDown={(e) => {
                        if (!paymentSuccess) {
                            e.preventDefault()
                            setShowConfirmDialog(true)
                        }
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            <span>
                                {paymentSuccess ? 'Thanh toán thành công' : 'Quét mã QR để thanh toán'}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={handleCloseAttempt}
                            >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Đóng</span>
                            </Button>
                        </DialogTitle>
                        <DialogDescription>
                            {paymentSuccess
                                ? 'Giao dịch đã được xử lý thành công'
                                : `Số tiền: ${amount.toLocaleString('vi-VN')} đ`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col items-center justify-center gap-4 py-6">
                        {isConnecting ? (
                            <>
                                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">
                                    Đang tạo mã QR thanh toán...
                                </p>
                            </>
                        ) : paymentSuccess ? (
                            <>
                                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                                    <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
                                </div>
                                <p className="text-center text-lg font-medium">
                                    Thanh toán thành công!
                                </p>
                                <p className="text-center text-sm text-muted-foreground">
                                    Hóa đơn đang được in tự động...
                                </p>
                            </>
                        ) : qrCode ? (
                            <>
                                {/* QR Code Image */}
                                <div className="rounded-lg border-4 border-primary bg-white p-4">
                                    <img
                                        src={qrCode}
                                        alt="QR Code thanh toán"
                                        className="h-64 w-64 object-contain"
                                    />
                                </div>

                                {/* Order Info */}
                                <div className="w-full space-y-2 rounded-lg bg-muted p-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Mã đơn hàng:</span>
                                        <span className="font-mono font-semibold">{orderCode}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Số tiền:</span>
                                        <span className="font-semibold text-primary">
                                            {amount.toLocaleString('vi-VN')} đ
                                        </span>
                                    </div>
                                </div>

                                {/* Instructions */}
                                <div className="w-full space-y-2 text-center text-sm text-muted-foreground">
                                    <p>Mở ứng dụng ngân hàng và quét mã QR để thanh toán</p>
                                    <p className="text-xs">
                                        ⚠️ Không đóng cửa sổ này cho đến khi thanh toán hoàn tất
                                    </p>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-destructive">
                                Không thể tạo mã QR. Vui lòng thử lại.
                            </p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Confirm Close Dialog */}
            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Xác nhận đóng thanh toán</AlertDialogTitle>
                        <AlertDialogDescription>
                            Bạn chưa hoàn thành thanh toán. Nếu đóng cửa sổ này, bạn sẽ cần tạo mã QR
                            mới để thanh toán. Bạn có chắc chắn muốn đóng?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowConfirmDialog(false)}>
                            Tiếp tục thanh toán
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setShowConfirmDialog(false)
                                onForceClose()
                            }}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Đóng và hủy
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
