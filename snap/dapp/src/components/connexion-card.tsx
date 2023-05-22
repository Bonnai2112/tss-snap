import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardMedia from '@mui/material/CardMedia';
import * as React from 'react';
import SnapConnect from '../snap-connect';

export default function ConnexionCard() {
    return (
        <Card sx={{ maxWidth: 500 }}>
            <CardMedia
                sx={{ height: 500 }}
                image="../../images/wallet_icon.png"
                title="green iguana"
            />
            <CardActions sx={{ padding: 3 }}>
                <SnapConnect redirect="/keys" />
            </CardActions>
        </Card>
    );
}
